'use strict';
const fs = require('node:fs');
const path = require('node:path');
function check(root) {
  const templates = fs.readdirSync(path.join(root, 'scripts')).filter((name) => name.endsWith('-common.template.js')).sort();
  const functions = fs.readdirSync(path.join(root, 'cloudfunctions'), {withFileTypes: true}).filter((entry) => entry.isDirectory());
  if (!templates.length || !functions.length) throw new Error('No cloud templates or functions found');
  const errors = [];
  for (const fn of functions) for (const template of templates) {
    const name = template === 'cloud-common.template.js' ? 'common' : template.replace(/-common\.template\.js$/, '');
    const relative = `cloudfunctions/${fn.name}/lib/${name}.js`;
    let data;
    try { data = fs.readFileSync(path.join(root, relative)); } catch (error) { if (error.code === 'ENOENT') { errors.push(`missing shared lib: ${relative}`); continue; } throw error; }
    if (!data.equals(fs.readFileSync(path.join(root, 'scripts', template)))) errors.push(`shared lib mismatch: ${relative}`);
  }
  return errors;
}
if (require.main === module) {
  try { const errors = check(path.join(__dirname, '..')); if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; } else console.log('cloud shared lib check passed'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {check};
