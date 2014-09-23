module.exports = function (addon) {
  // chain global middleware together as needed
  return require('./request')(addon);
};
