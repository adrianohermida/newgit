import os
p = r'D:\Github\newgit\functions\api\agendar.js'
with open(p, 'r', encoding='utf-8') as f: c = f.read()
s = '  let zoomSnapshot = null;'
e = '  ]);'
if s in c and e in c:
  i1 = c.find(s)
  i2 = c.find('await Promise.all([', i1)
  if i2 != -1:
    i3 = c.find(e, i2) + 5
    b = c[i1:i3]
    n = '  context.waitUntil((async () => {\\n    try {\\n' + b + '\\n    } catch (err) { console.error(err); }\\n  })());'
    with open(p, 'w', encoding='utf-8') as f: f.write(c[:i1] + n + c[i3:])
    print('OK')
else: print('FAIL')
