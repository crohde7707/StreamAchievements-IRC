const path = require('path');
const nodeExternals = require('webpack-node-externals');

const serverConfig = {
  target: "node",
  entry: {
    app: ["./main.js"]
  },
  output: {
    path: path.resolve(__dirname, "./dist"),
    filename: "main.js"
  },
  externals: [nodeExternals()],
};

module.exports = serverConfig;