if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
  require("./index");
} else {
  const startAdapter = eval("require")("./adapter/main");
  if (require.main === module) {
    startAdapter();
  } else {
    module.exports = startAdapter;
  }
}
