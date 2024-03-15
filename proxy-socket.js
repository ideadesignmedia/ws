const [host, port] = process.argv.slice(2)
const makeServer = require('./')
const {newSocket} = require('./be')
const { wss } = makeServer({ port: port || 2800 }, (ws) => {
    //console.log('CONNECTED SOCKET', ws.ID)
}, (type, data) => {
    //console.log('client', type, data)
    //console.log('forwarding', type, data, Boolean(connection))
    if (connection) connection.ws.sendData({ type, data })
}, sock => {
    //console.log(`DISCONNECTED SOCK`, sock)
})
const connection = newSocket(host, () => {
    //console.log('CONNECTED TO SERVER')
}, (type, data) => {
    //console.log('received', type, data)
    wss.clients.forEach(client => {
        client.reply({ type, data })
    })
}, () => {
    //console.log('DISCONNECTED FROM SERVER')
})