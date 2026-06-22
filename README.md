# v36 – Embed Google Drive Videos Inline

## What changed
Videos in reports are now embedded directly in the page using Google Drive's `/preview` iframe endpoint. Collectors and admins can watch videos without leaving the site.

## Files changed
| File | Change |
|------|--------|
| `components/MyReportsView.tsx` | Replace `<a href=".../view">` links with `<iframe src=".../preview">` embeds |
| `components/AdminReportsView.tsx` | Same — admins also see inline video players |

## Deploy
Copy both files to the `components/` folder in your project root, then push to GitHub.

No database changes required.
