const { ZoneServer } = require("../../h1z1-server");

const Zone = new ZoneServer(
  1117,
  Buffer.from("F70IaxuU8C/w7FPXY1ibXw==", "base64")
);
Zone.start();
