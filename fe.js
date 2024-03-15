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
        if (!this.ws || this.ws && this.ws.readyState !== WebSocket.OPEN) {
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
            const emitter = new EventEmitter()
            const reader = new FileReader();
            reader.addEventListener('loadend', (e) => emitter.emit('data', e.srcElement.result));
            const handleMessage = e => new Promise((res) => {
                const { data } = e
                if (data instanceof Blob) {
                    emitter.on('data', e => res(e.detail))
                    reader.readAsText(data);
                } else {
                    res(data)
                }
            })
            this.ws = new WebSocket(address)
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
                        return console.log(`RECEIVED DATA: ${JSON.stringify(data)}`)
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

class EventEmitter extends EventTarget {
    constructor() {
        super()
    }
    emit(name, data) {
        this.dispatchEvent(new CustomEvent(name, { detail: data }))
    }
    on(name, callback) {
        this.addEventListener(name, callback)
    }
    once(name, callback) {
        const onceCallback = (e) => {
            this.removeEventListener(name, onceCallback)
            callback(e)
        }
        this.addEventListener(name, onceCallback)
    }
    off(name, callback) {
        this.removeEventListener(name, callback)
    }
}

export const socketRequests = (WS) => {
    const EventQue = new EventEmitter()
    let socket = new newSocket(WS, undefined, (type, _data) => {
        const { responseCode, message, data } = _data
        switch (type) {
            case 'error': {
                EventQue.emit(responseCode, { error: true, message })
                break
            }
            case 'response': {
                EventQue.emit(responseCode, { data })
                break
            }
            default: {
                if (responseCode) EventQue.emit(responseCode, { type, data })
                else EventQue.emit('data', { type, data: _data })
            }
        }
    })
    return {
        EventQue,
        websocketRequest: (type, data) => {
            return new Promise((res, rej) => {
                const responseCode = `${Math.random() * 100000000}${new Date().getTime()}`
                let timeout
                const result = (e) => {
                    clearTimeout(timeout)
                    if (e.detail.error) rej(e.detail.error)
                    else res(e.detail.data)
                }
                timeout = setTimeout(() => {
                    EventQue.off(responseCode, result)
                    rej(new Error(`Request timed out after 120 seconds, type: ${type} data: ${JSON.stringify(data)}`))
                }, 120000)
                const timeoutResponse = () => clearTimeout(timeout)
                EventQue.once(responseCode, result)
                EventQue.once(responseCode, timeoutResponse)
                socket.ws.sendData({ type, data: { data, responseCode } })
            })
        },
        websocketStream: (type, data, result) => {
            const responseCode = `${Math.random() * 100000000}${new Date().getTime()}`
            EventQue.on(responseCode, result)
            try {
                socket.ws.sendData({ type, data: { responseCode, data } })
            } catch (e) {
                EventQue.off(responseCode, result)
                throw e
            }
            return () => {
                EventQue.off(responseCode, result)
            }
        },
        socket
    }
}
export default newSocket