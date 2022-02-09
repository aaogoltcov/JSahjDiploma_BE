'use strict';

const http = require('http');
const Koa = require('koa');
const koaBody = require('koa-body');
const WS = require('ws');
const cors = require('@koa/cors');
const BSON = require("bson");
const app = new Koa();
const fs = require('fs');

app.use(cors());
app.use(koaBody({
  urlencoded: true,
  multipart: true,
  json: true,
}));

fs.readFile('data.json', 'utf-8', (err, data) => { if (err) { throw err }

  // parse JSON object
  let listOfMessages = JSON.parse(data.toString());

  app.use(async ( ctx ) => {
    if ( ctx.request.method === 'POST' || ctx.request.body.method === 'getAllMessages' ) {
      ctx.response.status = 290;
      let groupedData = [];
      if ( ctx.request.body.page !== 'undefined' ) {
        const lazyLoading = ctx.request.body.lazyLoading;
        const page = ctx.request.body.page;
        const length = listOfMessages.length;
        const start = length - ( page + 1 ) * 5;
        const end = length - page * 5;
        if ( lazyLoading ) {
          if ( end >= 0 ) {
            groupedData.push({
              page: page,
              data: listOfMessages.slice(start < 0 ? 0 : start, end),
            });
            ctx.response.body = groupedData;
          } else {
            ctx.response.body = [];
          }
        } else {
          const data = listOfMessages.slice( start < 0 ? 0 : start , length );
          for ( let group = 0; group <= page; group = group + 1 ) {
            groupedData.push({
              page: group,
              data: data.slice(data.length - (group + 1) * 5, data.length - group * 5),
            })
          }
          ctx.response.body = groupedData;
        }
      } else {
        for ( let group = listOfMessages.length; group >= 0; group = group - 1 ) {
          groupedData.push({
            page: group,
            data: listOfMessages.slice(listOfMessages.length - (group + 1) * 5, listOfMessages.length - group * 5),
          })
        }
        ctx.response.body = groupedData;
      }
    }
  });

  const port = process.env.PORT || 7070;
  const server = http.createServer(app.callback())
  const wsServer = new WS.Server({ server });

  wsServer.on('connection', ( ws ) => {
    const errCallback = ( err ) => { if (err) { console.log( err ) } };
    let frontendMessage = String();
    ws.on('message', msg => {
      let pinnedMessage = Object();
      if ( msg ) {
        let newMessage = BSON.deserialize( msg );
        let newListOfMessages = [];
        if ( newMessage.type === 'pinned' ) {
          for ( let message of listOfMessages ) {
            let messageData = function ( message ) {
              try {
                return BSON.deserialize( Buffer.from(message.data) );
              } catch( e ) {
                return BSON.deserialize( message );
              }
            }
            let oldMessage = messageData( message );
            if ( oldMessage.uuid === newMessage.uuid ) {
              if ( oldMessage.pinned === true ) {
                oldMessage.pinned = false;
              } else {
                oldMessage.pinned = true;
              }
            } else if ( oldMessage.pinned === true ) {
              oldMessage.pinned = false;
            }
            pinnedMessage = BSON.serialize( oldMessage );
            newListOfMessages.push( pinnedMessage );
          }
          listOfMessages = newListOfMessages;
          frontendMessage = {
            name: "pinnedUploaded",
            data: pinnedMessage,
          };
        } else {
          listOfMessages.push( msg );
          frontendMessage = {
            name: "messagesUploaded",
            data: {}
          };
        }

        Array.from(wsServer.clients)
            .filter( o => o.readyState === WS.OPEN )
            .forEach( o => o.send( JSON.stringify(frontendMessage) ) );
      } else {
        ws.send('response', errCallback);
      }
    });
    ws.send('welcome', errCallback);
  });
  server.listen( port );
});


