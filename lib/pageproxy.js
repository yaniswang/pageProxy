var net = require('net');
var http = require('http');
var https = require('https');
var path = require('path');
var fs = require('fs');
var crypto = require("crypto");
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var HttpFilter = require('./httpfilter');
var utils = require('./utils');
var extend =utils.extend;
var pem = require('pem');

// read ca key
var caPath = path.resolve(__dirname+'/../cert/');
var caCert = fs.readFileSync(caPath+'/ca.crt').toString('utf-8');
var caKey = fs.readFileSync(caPath+'/ca.key').toString('utf-8');

http.globalAgent.maxSockets = 999999;
https.globalAgent.maxSockets = 999999;

var defaultConfig = {
    'keyPath': '',  // key path
    'gunzip': true,  // gunzip
    'delgzip': true, // delgzip
};

var PageProxyServer = function(){
    var self = this;
    return self._init.apply(self, arguments);
}
util.inherits(PageProxyServer, EventEmitter);

var PageProxyPrototype = PageProxyServer.prototype;

PageProxyPrototype._init = function(options){
    var self = this;
    var config = extend({}, defaultConfig, options);

    self._keyPath = config.keyPath ? path.resolve(config.keyPath) + '/' : '';
    self._mapCerts = {};

    self._httpServer = null;
    self._httpsServer = null;

    self.readyState = 0;

    self._arrTopFilters = [];

    self._arrFilters = [];

    self.filterConfig = {
        gunzip: config.gunzip,
        delgzip: config.delgzip
    };
};

// add http filter
PageProxyPrototype.addFilter = function(filter, bTop){
    var self = this;
    self[bTop?'_arrTopFilters':'_arrFilters'].push(filter);
};

// listen http and https
PageProxyPrototype.listen = function(port, callback){
    var self = this;

    self.httpPort = port;
    self.httpsPort = (port !== 0) ? port + 1 : 0;

    if(callback !== undefined){
        self.on('ready', callback);
    }

    self._startHttp();
    self._startHttps();
    self.on('httpsReady', function(){
        self._proxyHttps();
    });
};

// check readyState
PageProxyPrototype._addReady = function(){
    var self = this;
    self.readyState ++;
    if(self.readyState === 2){
        self.emit('ready');
    }
}

// start http server
PageProxyPrototype._startHttp = function(){
    var self = this;
    var httpPort = self.httpPort;

    if(self._httpServer === null){
        var httpServer = http.createServer(function(req, res){
            self._doResponse(req, res);
        }).listen(httpPort, function () {
            self._httpPort = httpServer.address().port;
            self.emit('httpReady', {
                port: self._httpPort
            });
            self._addReady();
        });
        httpServer.on('error', function(error){
            self.emit('error', {
                type: 'httpserver',
                info: error
            });
        });
        self._httpServer = httpServer;
    }
};

// start https server
PageProxyPrototype._startHttps = function(){
   var self = this;
   var httpsPort = self.httpsPort;

    if(self._httpsServer === null){
        var mapCerts = self._mapCerts;
        var httpsServer = https.createServer({
            key: caKey,
            cert: caCert,
            SNICallback: function(hostname){
                return mapCerts[hostname];
            }
        },function(req, res){
            req.url = 'https://' + req.headers['host'] + req.url;
            self._doResponse(req, res);
        }).listen(httpsPort, function(){
            self._httpsPort = httpsServer.address().port;
            self.emit('httpsReady', {
                port: self._httpsPort
            });
            self._addReady();
        });
        httpsServer.on('error', function(error){
            self.emit('error', {
                type: 'httpsserver',
                info: error
            });
        });
        self._httpsServer = httpsServer;
    }
};

// get cert from file
PageProxyPrototype._getCert = function(hostname, callback){
    var self =this;
    var mapCerts = self._mapCerts;
    var keyPath = self._keyPath;

    var keyFile = keyPath + hostname + '.key';
    if(keyPath && fs.existsSync(keyFile)){
        mapCerts[hostname] = crypto.createCredentials({
            'key': fs.readFileSync(keyFile).toString('utf-8'),
            'cert': fs.readFileSync(keyPath + hostname + '.crt').toString('utf-8'),
        }).context;
        callback();
    }
    else{
        pem.createCertificate({
            serial: '0x' + crypto.createHash('md5').update(hostname, 'utf8').digest('hex') + Math.floor(Math.random()*100000+1),
            commonName: hostname,
            serviceKey: caKey,
            serviceCertificate: caCert,
            days: 7305
        }, function (error, ret) {
            if(ret){
                var key = ret.clientKey;
                var cert = ret.certificate;
                mapCerts[hostname] = crypto.createCredentials({
                    'key': key,
                    'cert': cert,
                }).context;
                if(keyPath){
                    fs.writeFileSync(keyPath+hostname+'.key', key);
                    fs.writeFileSync(keyPath+hostname+'.crt', cert);
                }
                self.emit('makeCert', {
                    hostname: hostname
                });
                callback();
            }
            else{
                self.emit('error', {
                    type: 'creatCert',
                    info: error
                });
            }
        });
    }
}

// proxy http port to https
PageProxyPrototype._proxyHttps = function(){
    var self = this;
    var httpServer = self._httpServer;
    var httpsPort = self._httpsPort;

    if(httpServer){
        httpServer.on('connect', function(req, reqSocket, upgradeHead) {
            var match = req.url.match(/([^:]+):443/);
            var hostname = match && match[1] || '';
            var mapCerts = self._mapCerts;
            var cert = mapCerts[hostname];
            if(cert === undefined){
                self._getCert(hostname, beginHttpsPipe);
            }
            else{
                beginHttpsPipe();
            }
            function beginHttpsPipe(){
                var resSocket = net.connect(httpsPort);
                resSocket.on('connect', function () {
                    reqSocket.write("HTTP/1.1 200 Connection established\r\n\r\n");
                });
                reqSocket.pipe(resSocket).pipe(reqSocket);
            }
        });
    }
};

// do proxy response
PageProxyPrototype._doResponse = function(clientRequest, clientResponse){
    var self = this;

    var arrRequestBuffers = [], requestBufferSize = 0;
    clientRequest.on('data', function (data) {
        arrRequestBuffers.push(data);
        requestBufferSize += data.length;
    });
    clientRequest.on('end', function () {
        var requestBuffer = new Buffer(requestBufferSize), pos = 0;
        for(var i = 0, c = arrRequestBuffers.length; i < c; i++) {
            arrRequestBuffers[i].copy(requestBuffer, pos);
            pos += arrRequestBuffers[i].length;
        }
        self.emit('request', {
            url: clientRequest.url
        });
        var httpData = {
            'method': clientRequest.method,
            'url': clientRequest.url,
            'requestHeaders': clientRequest.headers,
            'requestData': requestBuffer
        };
        var arrFilters = self._arrTopFilters.concat(self._arrFilters);
        new HttpFilter(arrFilters, httpData, self.filterConfig, function(httpData){
            var responseCode = httpData.responseCode,
                responseHeaders = httpData.responseHeaders,
                responseData = httpData.responseData;
            if(responseCode !== undefined){
                clientResponse.writeHeader(responseCode, responseHeaders);
                clientResponse.write(responseData);
                clientResponse.end();
                clientRequest.destroy();
            }
            else{
                var requestOptions = {
                    'method' : httpData.method,
                    'protocol': httpData.protocol,
                    'hostname' : httpData.hostname,
                    'port' : httpData.port,
                    'path' : httpData.path,
                    'headers' : httpData.requestHeaders,
                    'agent' : false,
                    'rejectUnauthorized' : false
                };
                self._getRequest(requestOptions, httpData.requestData, function(responseCode, responseHeaders, responseData, responseTimes){
                    httpData.responseCode = responseCode;
                    httpData.responseHeaders = responseHeaders;
                    httpData.responseData = responseData;
                    httpData.responseTimes = responseTimes;
                    new HttpFilter(arrFilters, httpData, self.filterConfig, function(httpData){
                        //修复https某些情况下会出现数据没发送完就断开的问题
                        delete httpData.responseHeaders['connection'];
                        clientResponse.writeHeader(httpData.responseCode, httpData.responseHeaders);
                        clientResponse.write(httpData.responseData);
                        clientResponse.end();
                    });
                }, function(e){
                    clientResponse.end();
                    self.emit('error', {
                        url: httpData.url,
                        type: 'remote',
                        info: e
                    });
                });
            }
        });
    });
    clientRequest.on('error', function (e) {
        clientRequest.destroy();
        self.emit('error', {
            type: 'client',
            info: e
        });
    });
}

// do remote request
PageProxyPrototype._getRequest = function(requestOptions, requestData, endCallback, errorCallback){
    var self = this;
    var sendEndTime, responseStartTime, responseEndTime;

    var remoteRequest = (requestOptions.protocol==='https:'?https:http).request(requestOptions);

    remoteRequest.setTimeout(60000, function(){
        errorCallback({code:'ConnectionTimedOut.'});
    });

    remoteRequest.on('response', function (remoteResponse) {
        responseStartTime = new Date().getTime();//响应开始时间
        var arrResponseBuffers = [], responseBufferSize = 0;
        remoteResponse.on('data', function (data) {
            arrResponseBuffers.push(data);
            responseBufferSize += data.length;
        });
        remoteResponse.on('end', function () {
            remoteRequest.destroy();
            responseEndTime = new Date().getTime();//响应结束时间
            var responseBuffer = new Buffer(responseBufferSize), pos = 0;
            for(var i = 0, c = arrResponseBuffers.length; i < c; i++) {
                arrResponseBuffers[i].copy(responseBuffer, pos);
                pos += arrResponseBuffers[i].length;
            }
            if(endCallback){
                // merge chunk
                delete remoteResponse.headers['transfer-encoding'];
                endCallback(remoteResponse.statusCode, remoteResponse.headers, responseBuffer, {
                    'wait': responseStartTime - sendEndTime,
                    'receive': responseEndTime - responseStartTime
                });
            }
        });
        remoteResponse.on('error', function (e) {
            remoteRequest.destroy();
            if(errorCallback){
                errorCallback(e);
            }
        });
    });
    remoteRequest.on('error', function (e) {
        remoteRequest.destroy();
        if(errorCallback){
            errorCallback(e);
        }
    });
    remoteRequest.write(requestData);
    remoteRequest.end();
    sendEndTime = new Date().getTime();//发送结束时间
}

// close proxy server
PageProxyPrototype.close = function(){
    var self = this;
    var httpServer = self._httpServer;
    var httpsServer = self._httpsServer;

    if(httpServer){
        httpServer.close();
        self._httpServer = null;
    }

    if(httpsServer){
        httpsServer.close();
        self._httpsServer = null;
    }

    self.emit('close');
};

var pageproxy = {
    Server: PageProxyServer,
    createServer: function(config, filter){
        var proxyServer = new PageProxyServer(config);
        if(filter !== undefined){
            proxyServer.addFilter(filter);
        }
        return proxyServer;
    }
};

module.exports = pageproxy;