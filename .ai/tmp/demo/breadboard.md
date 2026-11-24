---
jig: breadboard
title: Login breadboard
---
## Login page
- Email field
  id:: a1
  kind:: ui
  wires:: a2>control
- Submit
  id:: a2
  kind:: ui
  control:: button
  wires:: c1>data
  Sends the form.
## Auth service
- Check password
  id:: c1
  kind:: code
  wires:: c2>control, a3>data
- Create session
  id:: c2
  kind:: code
## Dashboard
- Welcome banner
  id:: a3
  kind:: ui
