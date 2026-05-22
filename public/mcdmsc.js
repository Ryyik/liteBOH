// mcdmsc.js - 用于存储BOH服务器端口号
// 网站开发者可在此文件中注入端口数据

// 全局变量，用于存储端口号
window.BOH_SERVER_PORT = {
  // 默认端口号，开发者可根据实际情况修改
  port: "方块之家冬眠生存第四弹，服务器上线时间视情况而定。",
  // 游戏链接
  game: "https://qfile.qq.com/q/6baZlrPHS8",
  // 可以添加更多相关信息
  version: "1.0.0",
  name: "BOH服务器 - 冬眠生存第四弹"
};

// 可选：添加端口更新函数，允许动态更新端口
window.updatePort = function (newPort) {
  window.BOH_SERVER_PORT.port = newPort;
  return true;
};
