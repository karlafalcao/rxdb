import { Subject } from 'rxjs';
import { PROMISE_RESOLVE_VOID, getFromMapOrThrow } from '../../plugins/utils';
import { createWebSocketClient, startSocketServer } from '../replication-websocket';
import { exposeRxStorageRemote } from '../storage-remote/remote';
import { getRxStorageRemote } from '../storage-remote/rx-storage-remote';
import { createErrorAnswer } from '../storage-remote/storage-remote-helpers';
export function startRxStorageRemoteWebsocketServer(options) {
  var serverState = startSocketServer(options);
  var websocketByConnectionId = new Map();
  var messages$ = new Subject();
  var exposeSettings = {
    messages$: messages$.asObservable(),
    storage: options.storage,
    database: options.database,
    customRequestHandler: options.customRequestHandler,
    send(msg) {
      var ws = getFromMapOrThrow(websocketByConnectionId, msg.connectionId);
      ws.send(JSON.stringify(msg));
    }
  };
  var exposeState = exposeRxStorageRemote(exposeSettings);
  serverState.onConnection$.subscribe(ws => {
    var onCloseHandlers = [];
    ws.onclose = () => {
      onCloseHandlers.map(fn => fn());
    };
    ws.on('message', messageString => {
      var message = JSON.parse(messageString);
      var connectionId = message.connectionId;
      if (!websocketByConnectionId.has(connectionId)) {
        /**
         * If first message is not 'create',
         * it is an error.
         */
        if (message.method !== 'create' && message.method !== 'custom') {
          ws.send(JSON.stringify(createErrorAnswer(message, new Error('First call must be a create call but is: ' + JSON.stringify(message)))));
          return;
        }
        websocketByConnectionId.set(connectionId, ws);
      }
      messages$.next(message);
    });
  });
  return {
    serverState,
    exposeState
  };
}
export function getRxStorageRemoteWebsocket(options) {
  var identifier = [options.url, 'rx-remote-storage-websocket'].join('');
  var storage = getRxStorageRemote({
    identifier,
    statics: options.statics,
    mode: options.mode,
    async messageChannelCreator() {
      var messages$ = new Subject();
      var websocketClient = await createWebSocketClient(options.url);
      websocketClient.message$.subscribe(msg => messages$.next(msg));
      return {
        messages$,
        send(msg) {
          return websocketClient.socket.send(JSON.stringify(msg));
        },
        close() {
          websocketClient.socket.close();
          return PROMISE_RESOLVE_VOID;
        }
      };
    }
  });
  return storage;
}
export * from './types';
//# sourceMappingURL=index.js.map