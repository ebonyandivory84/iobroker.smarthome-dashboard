if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
  require("./index");
} else {
  module.exports = eval("require")("./adapter/main");
}
