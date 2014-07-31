var zlib = require('zlib');
var iconv = require('iconv-lite');
var cookie = require('cookie');
var utils = require('./utils');
var extend = utils.extend;
var updateUrlInfo = utils.updateUrlInfo;
var updateContentType = utils.updateContentType;

var HttpFilter = function(){
    var self = this;
    return self._init.apply(self, arguments);
}

var HttpFilterPrototype = HttpFilter.prototype;

HttpFilterPrototype._init = function(arrFilters, httpData, endCallback){
    var self = this;

    self.arrFilters = arrFilters.slice();
    self.httpData = httpData;
    self._endCallback = endCallback;

    httpData.type = httpData.responseCode !== undefined ? 'response' : 'request';

    if(httpData.protocal === undefined){
        updateUrlInfo(httpData);
        var mapCookie = {},
            strCookie = httpData.requestHeaders['cookie'];
        if(strCookie !== undefined){
            mapCookie = cookie.parse(strCookie);
        }
        httpData.cookie = mapCookie;
    }

    //响应数据包更新内容类型：responseType,responseCharset
    if(httpData.type === 'response' && httpData.responseData){
        httpData.isGzip = /^gzip$/i.test(httpData.responseHeaders['content-encoding']);
        if(httpData.isGzip){
            // ungzip
            zlib.gunzip(httpData.responseData, function(err, unzipBuffer){
                updateContentType(httpData, unzipBuffer);
                //能识别charset的情况下转换内容为utf-8格式
                if(httpData.responseCharset !== undefined){
                    httpData.responseContent = iconv.decode(unzipBuffer, httpData.responseCharset);
                }
                self.next();
            });
            return;
        }
        else{
            updateContentType(httpData);
            //能识别charset的情况下转换内容为utf-8格式
            if(httpData.responseCharset !== undefined){
                httpData.responseContent = iconv.decode(httpData.responseData, httpData.responseCharset);
            }
        }
    }
    
    self.next();
}

HttpFilterPrototype.next = function(){
    var self = this,
        nextFilter = self.arrFilters.shift();

    if(nextFilter){
        nextFilter(self.httpData, function(){
            self.next();
        }, function(){
            self.end();
        });
    }
    else{
        self.end();
    }
}

HttpFilterPrototype.end = function(){
    var self = this;
    var httpData = self.httpData;

    var endCallback = self._endCallback;

    //重新转为原始编码
    if(httpData.responseContent !== undefined){
        httpData.responseContent = iconv.encode(httpData.responseContent, httpData.responseCharset);
        if(httpData.isGzip){
            //gzip content
            zlib.gzip(httpData.responseContent, function(err, zipBuffer){
                httpData.responseData = zipBuffer;
                httpData.responseHeaders['content-length'] = httpData.responseData.length;
                if(endCallback){
                    endCallback(httpData);
                }
            });
            return;
        }
        else{
            httpData.responseData = httpData.responseContent;
            httpData.responseHeaders['content-length'] = httpData.responseData.length;
        }
    }
    if(endCallback){
        endCallback(httpData);
    }
}

module.exports = HttpFilter;