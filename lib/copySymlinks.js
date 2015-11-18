import through from 'through2';
import fs from 'fs';
import del from 'del';
import vinylPaths from 'vinyl-paths';

let copySymlinks = function () {
  return through.obj(function(file, enc, cb){

    file.contents = fs.createReadStream(file.path);
    this.push(file);
    return cb();
  });
};

let deleteFiles = function () {
  return through.obj(function(file, enc, cb){
    del(vinylPaths(file)).then(() => {
      this.push(file);
      return cb();
    });
  });
};

export { copySymlinks, deleteFiles };
