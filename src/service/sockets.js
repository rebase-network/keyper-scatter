const WebSocket = require('ws');
const { app, BrowserWindow } = require('electron');

let mainWindow;

class SocketService {
  constructor() {
    this.wss = null;
    this.openConnections = {};
  }

  async getNewKey(origin, id) {
    return new Promise((resolve, reject) => {
      this.rekeyPromise = { resolve, reject };
      this.emit(origin, id, 'rekey');
      return this.rekeyPromise;
    })
  }

  async emit(origin, id, path, data) {
    const socket = this.openConnections[origin + id];
    return this.emitSocket(socket, path, data);
  }

  async emitSocket(socket, path, data) {
    if (!socket) return console.error('No socket found');
    socket.send('42/keyper,' + JSON.stringify([path, data ? data : false]))
  }

  async initialize() {
    const socketHandler = socket => {
      let origin = null;

      socket.send("40");
      socket.send("40/keyper");
      socket.send(`42/keyper,["connected"]`);

      const id = Math.round(Math.random() * 999999999).toString();

      socket.on('close', () => delete this.openConnections[origin + id]);
      socket.on('disconnect', () => delete this.openConnections[origin + id]);

      socket.on('message', async msg => {
        if (msg.indexOf('42/keyper') === -1) return false;
        const [type, request] = JSON.parse(msg.replace('42/keyper,', ''));
        let requestOrigin = request.data.origin.replace(/\s/g, "").trim();

        if (!origin) origin = requestOrigin;
        else if (origin && requestOrigin !== origin) return killRequest();

        if (!this.openConnections.hasOwnProperty(origin + id)) {
          this.openConnections[origin + id] = socket;
        }
        if (type === "api") {
          if (request.type === "sign") {
            mainWindow.webContents.send(`popup-${request.type}`, request.data);
          }
          if (request.type === "query") {
            if (request.data.payload.method === "ALL_LOCKS") {
              const locks = await global.wallet.getAllLockHashesAndMeta();
              socket.send('42/keyper,' + JSON.stringify(["api", {query:"ALL_LOCKS", payload: locks}]));
            }
          }
        }
      });
    };

    this.wss = new WebSocket.Server({ port: 50001 });
    this.wss.on('connection', socketHandler);
  }

  async close() {
    this.wss.terminate();

    return true;
  }

  sendEvent(event, payload, origin) {
    const sockets = Object.keys(this.openConnections).filter(x => x.indexOf(origin) === 0).map(x => this.openConnections[x]);
    sockets.map(x => this.emitSocket(x, 'event', { event, payload }));
    return true;
  }

  broadcastEvent(event, payload) {
    Object.keys(this.openConnections).map(origin => this.sendEvent(event, payload, origin));
    return true;
  }
}

let sockets = new SocketService();
class HighLevelSockets {
  static setMainWindow(w) {
    mainWindow = w;
  }

  static async initialize() {
    return sockets.initialize();
  }

  static async close() {
    return sockets.close();
  }

  static async sendEvent(event, payload, origin) {
    return sockets.sendEvent(event, payload, origin);
  }

  static async broadcastEvent(event, payload) {
    return sockets.broadcastEvent(event, payload);
  }

  static async emit(origin, id, path, data) {
    return sockets.emit(origin, id, path, data);
  }

  static async getNewKey(origin, id) {
    return sockets.getNewKey(origin, id);
  }
}

module.exports = HighLevelSockets;