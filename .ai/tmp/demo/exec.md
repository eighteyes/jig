---
jig: exec
---
- `rm -rf build/`
  lang:: sh
  danger:: deletes the build folder
- [approve] `npm test`
- `git push --force origin main`
  danger:: true
- `ls -la`
