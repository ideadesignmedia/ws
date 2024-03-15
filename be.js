
const http = require('http'), https = require('https'), { URL } = require('url'), EventEmitter = require('events'), WS = require('ws')
class ResponseStream {
    constructor(stream) {
        this.stream = stream
        this.emitter = new EventEmitter()
        this.d = ''
        this.results = []
        this.stream.on('data', l => {
            this.d += l
            this.emitter.emit('data', l)
        })
        this.stream.on('end', () => {
            let o
            try {
                o = JSON.parse(this.d)
            } catch {
                o = this.d
            }
            this.emitter.emit('complete', o)
        })
        this.emitter.on('data', d => {
            if (typeof this.onData === 'function') this.onData(d)
        })
        this.emitter.on('complete', d => {
            if (typeof this.onComplete === 'function') this.onComplete(d)
        })
    }
}
const streamResponses = (url = '', options = {}, data = '') => {
    return new Promise((res, rej) => {
        let link = new URL(url)
        let provider = link.protocol === 'https:' ? https : http
        let req = provider.request(link, options, resp => {
            return res(new ResponseStream(resp))
        })
        req.on('error', e => rej(e))
        if (data) req.write(data)
        req.end()
    })
}
const handleStreamRequest = (stream, responseCode, ws, onData = data => data, onComplete = () => {}, responseType = 'response') => {
    stream.onData = (data) => {
        try {
            ws.reply({type: responseType, data: {responseCode, data: onData(data)}})
        } catch(e) {
            stream.stream.abort()
            ws.reply({type: 'error', data: {responseCode, message: e.message || e}})
        }
    }
    stream.onComplete = () => {
        onComplete();
        ws.reply({type: 'complete', data: {responseCode}})
    }
    return stream
}
const patternResponse = (type, data, responseCode) => ({type, data: {responseCode, data}})
const newSocket = function (address, onOpen = () => { }, onMessage = (type, data, ws) => {
    switch (type) {
        default: {
            return console.log(type, data, ws ? true : false)
        }
    }
}, onClose = () => { }) {
    this.failedConnections = 0
    this.ws
    this.socketCount = 1;
    this.closedConnection = false
    this.heartbeat = null
    this.socketWait = null
    this.retryTimer = null
    this.hitError = false
    this.checkws = () => {
        if (!this.ws || this.ws && this.ws.readyState !== WS.OPEN) {
            this.socketCount++
            clearInterval(this.heartbeat)
            clearTimeout(this.socketWait)
            clearTimeout(this.retryTimer)
            this.hitError = false
            this.closedConnection = false
            this.createSocket()
        }
    }
    this.waitForSocketConnection = (callback, data, timer = 1000, attempts = 1) => {
        clearTimeout(this.socketWait)
        if (!callback || typeof callback !== 'function') return
        if (this.ws.readyState === 0) {
            this.socketWait = setTimeout(() => { this.waitForSocketConnection(callback, data, timer) }, timer * (attempts + 1), attempts + 1)
        } else if (this.ws.readyState === 1) {
            callback(data)
        } else {
            this.socketWait = this.waitForSocketConnection(callback, data, timer * (attempts + 1), attempts + 1)
        }
    }
    this.createSocket = () => {
        try {
            const handleMessage = async e => {
                return e.data
            }
            this.ws = new WS(address)
            this.ws.onMessage = onMessage
            this.ws.sendData = (data) => {
                if (this.ws.readyState !== 1) {
                    this.waitForSocketConnection(data => { this.ws.send(JSON.stringify(data)) }, data)
                } else {
                    this.ws.send(JSON.stringify(data))
                }
            }
            this.ws.onopen = () => {
                this.heartbeat = setInterval(() => { this.checkws() }, 10000)
                this.ws.onmessage = (e) => handleMessage(e).then(data => {
                    let that
                    try {
                        that = JSON.parse(data)
                    } catch {
                        return console.log(data, `RECEIVED DATA: ${JSON.stringify(data)}`)
                    }
                    if (that) {
                        let { type, data } = that
                        this.ws.onMessage(type, data, this.ws)
                    }
                }).catch(e => console.error(e))
                onOpen()
            };
            this.ws.closeConnect = this.closeConnect
            this.ws.onerror = this.onerror
            this.ws.onclose = this.onclose
            this.ws.connects = this.socketCount
        } catch (e) {
            console.log(`WS ERROR: ${JSON.stringify(e)}`)
            this.hitError = true
            this.failedConnections++
            this.retryTimer = setTimeout(() => {
                this.createSocket()
            }, this.failedConnections * 1000)
        }
    }
    this.onclose = () => {
        onClose()
        if (!this.closedConnection || this.hitError) {
            clearInterval(this.heartbeat)
            clearTimeout(this.socketWait)
            this.failedConnections++
            this.retryTimer = setTimeout(() => {
                this.socketCount++
                this.createSocket()
            }, this.failedConnections * 1000)
        } else {
            clearTimeout(this.retryTimer)
            clearInterval(this.heartbeat)
            clearTimeout(this.socketWait)
        }
    }
    this.onerror = () => {
        this.hitError = true
        this.failedConnections++
    }
    this.closeConnect = () => {
        this.closedConnection = true
        this.ws.onerror = () => { }
        this.hitError = false
        clearTimeout(this.retryTimer)
        this.ws.close()
    }
    this.createSocket()
    return this
}

module.exports = {
    ResponseStream,
    streamResponses,
    handleStreamRequest,
    patternResponse,
    newSocket
}