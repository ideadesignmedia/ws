const makeServer = require('./')

const {wss} = makeServer({ port: 2900 }, (ws) => {
    console.log('CONNECTED SOCKET', ws.ID)
}, (type, data) => {
    console.log('client', type, data)
}, sock => {
    console.log(`DISCONNECTED SOCK`, sock)
})
setInterval(() => {
    wss.clients.forEach(client => {
        client.reply({ type: 'time', data: Date.now() })
    })
}, 2000)