pageProxy
=======================

![pageProxy logo](https://raw.github.com/yaniswang/pageProxy/master/logo.png)

[![NPM version](https://badge.fury.io/js/pageproxy.png)](http://badge.fury.io/js/pageproxy)

PageProxy is a proxy server for webpage debug and analysis.

Features
=======================

1. Support http & https filter.
2. Automatically create certificates for https request.
3. Support unzip gzip content.

Install
=======================

1. Install Nodejs
    
    [http://nodejs.org/](http://nodejs.org/)

2. Install pageProxy

        npm install pageproxy

Usage
=======================

Sample code here.

    var pageproxy = require('pageproxy');

    var proxy = pageproxy.createServer({
        keyPath: "./cert/",
        gunzip: true,
        delgzip: true
    }, function(httpData, next, end){
        // console.log(httpData.responseTimes);
        next();
    });

    proxy.on('httpReady', function(msg){
        console.log('httpready',msg);
    });
    proxy.on('httpsReady', function(msg){
        console.log('httpsready',msg);
    });
    proxy.on('ready', function(msg){
        console.log('ready', msg);
    });
    proxy.on('error', function(msg){
        console.log('error', msg);
    });
    proxy.on('close', function(msg){
        console.log('close',msg);
    });
    proxy.on('request', function(msg){
        console.log('request',msg);
    });
    proxy.addFilter(function(httpData, next, end){
        console.log(httpData.responseTimes);
        next();
    }, true);

    proxy.listen(1234, function(msg){
        console.log('ready', msg);
    });

Api
=======================

pageproxy.createServer(config, [filter])
-----------------------

Return pageproxy.Server object.

config:

1. keyPath

    Path of cert key, to save new cert file.

    Default value is empty, make new cert file time by time, very slow.

2. gunzip

    Unzip gzip content: true(unzip), false(not unzip)

    default value: true

3. delgzip

    Delete gzip header: true(delete), false(not delete)

    default value: true

Filter is same as server.addFilter(filter).

Class: pageproxy.Server
-----------------------

Proxy server class.

Event: 'httpReady'
-----------------------

Emitted when httpServer is ready. 

Event: 'httpsReady'
-----------------------

Emitted when httpsServer is ready. 

Event: 'ready'
-----------------------

Emitted when httpServer and httpsServer is ready. 

Event: 'error'
-----------------------

Emitted when server emits an 'error'.

Event: 'request'
-----------------------

Emitted each time there is a request. 

Event: 'close'
-----------------------

Emitted when server closed. 

server.addFilter(filter)
-----------------------

The parameter function will be added as a filter.

The function will been called when request come.

3 parameters will transmit to the function.

1. httpData

    The request info and response info will save here.

2. next

    You can call it when plugin task ended.

3. end

    You can call it when plugin want to end the request immediately.

server.listen(port, [readyCallback])
-----------------------

Start proxy on special port.

The callback is same as: `server.on('ready', callback);`

server.close()
-----------------------

Stops the server from accepting new connections. 

httpData
=======================

Member of httpData object:

    type                    : data type (request | response)

    *method                 : request method (GET | POST | ...)

    url                     : request url (http://www.test.com/a/b/t.html?a=2)

        *protocol           : request protocol (http: | https:)
        *hostname           : request hostname (www.test.com)
        *port               : request port (80 | 443)
        *path               : request path (/a/b/t.html?a=2)
        
        query               : request query object ({"a":"1"})

    *requestHeaders         : request headers
        cookie              : request cookie ({"userid":"123"})

    *requestData            : request data

    ----------------------------------------------

    *responseCode           : response code (200 | 404 | ...)

    *responseHeaders        : response header

    *responseData           : response data
        
        responseCharset     : response charset (gbk | utf-8)
        **responseContent   : response content with utf-8

        responseType        : response type (html | js | css | jpg | ...)
        responseTimes       : response times ({ wait: 47, receive: 1 })

1. mark with * will be send after filter
2. mark with ** have high priority

Mock http or https request
================

You can use pageProxy to mock http.

Sample code:

    var pageproxy = require('pageproxy');

    var proxy = pageproxy.createServer({
        keyPath: "./cert/",
        gunzip: true,
        delgzip: true
    }, function(httpData, next, end){
        if(httpData.path === '/test.js' && httpData.type === 'request'){
            console.log(httpData.url);
            httpData.responseCode = '200';
            httpData.responseHeaders = {
                'Content-Type': 'application/javascript'
            };
            httpData.responseData = 'alert(1);';
            return end();
        }
        next();
    });

    proxy.listen(1234, function(msg){
        console.log('ready', msg);
    });

License
================

pageProxy is released under the MIT license:

> The MIT License
>
> Copyright (c) 2014-2016 Yanis Wang \< yanis.wang@gmail.com \>
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

Thanks
================

* GitHub: [https://github.com/](https://github.com/)