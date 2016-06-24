import through from 'through2';
import fs from 'fs';
import path from 'path';

let isLink = function (path) {
  return fs.lstatSync(path).isSymbolicLink();
};

let copySymlinks = function () {
  return through.obj(function (file, enc, cb){
    if (!isLink(file.path)) {
      return cb();
    }
    let linkTarget = path.resolve(file.path, '..', fs.readlinkSync(file.path));
    fs.unlinkSync(file.path);
    fs.createReadStream(linkTarget).pipe(fs.createWriteStream(file.path));
    this.push(file);
    return cb();
  });
};

export { copySymlinks };
