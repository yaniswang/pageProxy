var url = require('url');

var mimeMaps = {
        'text/html': 'html',
        'text/x-server-parsed-html': 'html',
        'application/x-javascript': 'js',
        'text/javascript': 'js',
        'application/json': 'json',
        'text/css': 'css',
        'text/plain': 'txt',
        'text/xml': 'xml',
        'image/jpg': 'jpg',
        'image/jpeg': 'jpg',
        'image/pjpeg': 'jpg',
        'image/png': 'png',
        'image/x-png': 'png',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/x-bmp': 'bmp',
        'image/tiff': 'tiff',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/x-icon': 'icon',
        'application/font-woff': 'woff',
        'application/vnd.ms-fontobject': 'eot',
        'application/x-font-ttf': 'ttf',
        'application/pdf': 'pdf',
        'application/x-shockwave-flash': 'swf',
        'application/vnd.rn-realmedia-vbr': 'rmvb',
        'video/mp4': 'mp4',
        'video/mpeg': 'mpeg',
        'video/ogg': 'ogg',
        'video/quicktime': 'mov',
        'video/webm': 'webm',
        'video/x-flv': 'flv',
        'audio/x-wav': 'wav',
        'audio/x-ms-wma': 'wma'
    };
var extMaps = {
        'html': 'html',
        'htm': 'html',
        'shtm': 'html',
        'shtml': 'html',
        'css': 'css',
        'js': 'js',
        'txt': 'txt',
        'xml': 'xml',
        'jpg': 'jpg',
        'jpeg': 'jpg',
        'jpe': 'jpg',
        'png': 'png',
        'gif': 'gif',
        'bmp': 'bmp',
        'svg': 'svg',
        'svgz': 'svg',
        'tiff': 'tiff',
        'webp': 'webp',
        'tif': 'tiff',
        'ico': 'icon',
        'woff': 'woff',
        'eot': 'eot',
        'ttf': 'ttf',
        'pdf': 'pdf',
        'swf': 'swf',
        'rmvb': 'rmvb',
        'mp4': 'mp4',
        'mpeg': 'mpeg',
        'ogg': 'ogg',
        'mpg': 'mpeg',
        'rm': 'rmvb',
        'mov': 'mov',
        'qt': 'mov',
        'webm': 'webm',
        'flv': 'flv',
        'wav': 'wav',
        'wma': 'wma'
    };
    
// extend object
function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i],
            keys = Object.keys(source)

        for (var j = 0; j < keys.length; j++) {
            var name = keys[j]
            target[name] = source[name]
        }
    }

    return target
}

//分解网址信息
function updateUrlInfo(httpData){
    var urlInfo = url.parse(httpData.url, true);
    extend(httpData, {
        'protocol': urlInfo.protocol,
        'hostname': urlInfo.hostname,
        'port': urlInfo.port || (urlInfo.protocol==='https:'?443:80),
        'path': urlInfo.path,
        'query': urlInfo.query
    });
}

//分析文档类型
function updateContentType(httpData, unzipData){
    var responseHeaders = httpData.responseHeaders,  contentType = responseHeaders['content-type'];
    var type = null , charset = null;
    var match;
    if(contentType !== undefined){
        match = contentType.toLowerCase().match(/^([^;]+)(?:;\s*charset\s*=\s*(.+))?$/);
        if(match !== null){
            if(mimeMaps[match[1]] !== undefined){
                type = mimeMaps[match[1]];
            }
            if(match[2] !== undefined){
                charset = match[2];
            }
        }
    }
    if(type === null){
        match = httpData.path.toLowerCase().match(/\.([^\?\.]+)(\?|$)/);
        if(match !== null && extMaps[match[1]] !== undefined){
            type = extMaps[match[1]];
        }
    }
    if(type !== null){
        httpData.responseType = type;
    }

    //文本类型且无gzip状态下才检测charset
    var responseData = unzipData || httpData.responseData;
    if(responseData.length > 0 && type !== null && /^(html|css|js|json|txt|xml)$/.test(type) === true){
        //检测BOM
        var b0=responseData[0],b1=responseData[1],b2=responseData[2];
        if(b0===0xff && b1===0xfe){
            charset='unicode';
        }
        else if(b0===0xfe && b1===0xff){
            charset='utf-16be';
        }
        else if(b0===0xef && b1===0xbb && b2===0xbf){
            charset='utf-8';
        }
        //HTML中匹配charset
        if(charset === null && type === 'html'){
            var htmlTest = responseData.toString('utf-8', 0, 1000);
            match = htmlTest.match(/<meta(\s+[^>]*?)?\s+http-equiv\s*=\s*"?\s*Content-Type\s*"?(\s+[^>]*?)?>/i);
            if(match !== null && (match=match[0].match(/;\s*charset\s*=\s*([^"']+)/i))) charset=match[1];
            if(charset === null && (match=htmlTest.match(/<meta(?:\s+[^>]*?)?\s+charset\s*=\s*"([^"]*)"(?:\s+[^>]*?)?>/i))) charset = match[1];
        }
        //UTF-8特征扫描
        if( charset === null && isUTF8Bytes(responseData) === true){
            charset = 'utf-8';
        }
        httpData.responseCharset = charset ?  charset : 'gbk';
    }
}

function isUTF8Bytes(data) {
    var charByteCounter = 1;
    //计算当前正分析的字符应还有的字节数
    var curByte; //当前分析的字节.
    for (var i = 0, c = data.length; i < c; i++) {
        curByte = data[i];
        if (charByteCounter === 1) {
            if (curByte >= 0x80) {
                //判断当前
                while (((curByte <<= 1) & 0x80) !== 0) {
                    charByteCounter++;
                }
                //标记位首位若为非0 则至少以2个1开始 如:110XXXXX...........1111110X　
                if (charByteCounter === 1 || charByteCounter > 6) return false;
            }
        } else {
            //若是UTF-8 此时第一位必须为1
            if ((curByte & 0xC0) !== 0x80) return false;
            charByteCounter--;
        }
    }
    if (charByteCounter > 1) return false;
    return true;
}

module.exports = {
    extend: extend,
    updateUrlInfo: updateUrlInfo,
    updateContentType: updateContentType
};