/**
 * Copy every video in a Google Drive folder (and its sub-folders) into the
 * private Supabase bucket "presentation-videos", named "<driveFileId>.<ext>".
 * The dashboard then plays them for any logged-in user - no Drive sharing needed.
 *
 * Setup (one time):
 *   1. Go to https://script.google.com -> New project -> paste this file.
 *   2. Project Settings (gear) -> Script properties -> add:
 *        SUPABASE_URL          = https://<project>.supabase.co
 *        SUPABASE_SERVICE_KEY  = <service_role key>   (keep private!)
 *        DRIVE_FOLDER_ID       = <id from the folder URL .../folders/<ID>>
 *   3. Select function "migrate" -> Run -> allow permissions.
 *
 * Re-run "migrate" until the log says "ALL DONE". Each run stops after ~5 min
 * (Apps Script limit) and already-copied files are skipped.
 * Files over 50 MB are skipped and listed in the log.
 */

var BUCKET = "presentation-videos";
var MAX_BYTES = 50 * 1024 * 1024;
var TIME_BUDGET_MS = 5 * 60 * 1000;

function migrate() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("SUPABASE_URL");
  var key = props.getProperty("SUPABASE_SERVICE_KEY");
  var folderId = props.getProperty("DRIVE_FOLDER_ID");
  if (!url || !key || !folderId) throw new Error("Set the 3 Script properties first.");

  var existing = listExisting_(url, key);
  var start = Date.now();
  var stats = { copied: 0, skipped: 0, tooBig: [], failed: [] };
  var finished = walk_(DriveApp.getFolderById(folderId), url, key, existing, start, stats);

  Logger.log("Copied: " + stats.copied + " | Already there: " + stats.skipped);
  if (stats.tooBig.length) Logger.log("Too big (>50MB), not copied:\n" + stats.tooBig.join("\n"));
  if (stats.failed.length) Logger.log("Failed:\n" + stats.failed.join("\n"));
  Logger.log(finished ? "ALL DONE" : "Time limit reached - run migrate again to continue.");
}

function walk_(folder, url, key, existing, start, stats) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    if (Date.now() - start > TIME_BUDGET_MS) return false;
    var f = files.next();
    var mime = f.getMimeType() || "";
    if (mime.indexOf("video/") !== 0) continue;

    var id = f.getId();
    if (existing[id]) { stats.skipped++; continue; }
    if (f.getSize() > MAX_BYTES) { stats.tooBig.push(f.getName() + " (" + id + ")"); continue; }

    var ext = (f.getName().split(".").pop() || "mp4").toLowerCase();
    if (ext.length > 5) ext = "mp4";
    var res = UrlFetchApp.fetch(url + "/storage/v1/object/" + BUCKET + "/" + id + "." + ext, {
      method: "post",
      contentType: mime,
      payload: f.getBlob().getBytes(),
      headers: { Authorization: "Bearer " + key, apikey: key, "x-upsert": "true" },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() < 300) { stats.copied++; existing[id] = true; }
    else stats.failed.push(f.getName() + " -> " + res.getResponseCode() + " " + res.getContentText());
  }

  var subs = folder.getFolders();
  while (subs.hasNext()) {
    if (!walk_(subs.next(), url, key, existing, start, stats)) return false;
  }
  return true;
}

function listExisting_(url, key) {
  var seen = {};
  var offset = 0;
  while (true) {
    var res = UrlFetchApp.fetch(url + "/storage/v1/object/list/" + BUCKET, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ prefix: "", limit: 1000, offset: offset }),
      headers: { Authorization: "Bearer " + key, apikey: key },
      muteHttpExceptions: true,
    });
    var items = JSON.parse(res.getContentText() || "[]");
    if (!items.length) break;
    items.forEach(function (it) { seen[String(it.name).split(".")[0]] = true; });
    if (items.length < 1000) break;
    offset += 1000;
  }
  return seen;
}
