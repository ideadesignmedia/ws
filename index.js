const ws = require('ws')
const makeServer = (options = { port: 2800 }, onConnect = (ws) => {
    console.log('CONNECTED SOCKET', ws.ID)
}, onMessage = (type, data, ws) => {
    switch (type) {
        default: {
            return console.log(type, data)
        }
    }
}, onDisconnect = sock => {
    console.log(`DISCONNECTED SOCK`, sock)
}) => {
    var socks = [], wss = new ws.Server(options)
    wss.on('connection', function connection(ws, req) {
        ws.IP = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim() || req.ip
        ws.ID = 'WS' + Math.floor(Math.random() * 1000000000)
        ws.USER_AGENT = req.headers['user-agent']
        let sock = { ID: ws.ID, IP: ws.IP, USER_AGENT: ws.USER_AGENT }
        socks.push(sock)
        if (options.verbose) console.log(`Current Client Count: ${socks.length} | Connected:  ${JSON.stringify(sock)}`)
        ws.reply = (e) => { ws.send(JSON.stringify(e)) }
        ws.on('close', function close() {
            for (let i = 0; i < socks.length; i++) {
                if (socks[i].ID === ws.ID) {
                    let sock = socks.splice(i, 1)[0]
                    if (typeof onDisconnect === 'function') onDisconnect(sock)
                    if (options.verbose) console.log(`Current Client Count: ${socks.length} | Disconnected: ${JSON.stringify(sock)}`)
                }
            }
        })
        ws.on('error', e => console.log(`WS ERROR: ${JSON.stringify(e)}`))
        ws.on('message', async function incoming(message) {
            let that
            const m = message instanceof Buffer ? message.toString() : message
            try {
                that = typeof m === 'string' ? JSON.parse(m) : m
            } catch (e) {
                that = m
            }
            if (typeof that === 'object' && !(that instanceof Buffer)) {
                let { type, data } = that
                if (typeof onMessage === 'function') onMessage(type, data, ws)
            }
        })
        if (typeof onConnect === 'function') onConnect(sock)
    })
    return { socks, wss }
}
module.exports = makeServer
