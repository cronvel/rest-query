(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.restQueryShared = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

	Copyright (c) 2015 - 2016 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/


module.exports = {
	path: require( './path.js' )
} ;

},{"./path.js":3}],2:[function(require,module,exports){
/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

	Copyright (c) 2015 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/



// Charmap for string validation

var charmap = {
	lowerCaseArray: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'] ,
	upperCaseArray: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'] ,
	digitArray: ['0','1','2','3','4','5','6','7','8','9'] ,
	lowerCaseAndDigitArray: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9'] ,
	collectionRegExp: '^[A-Z][a-zA-Z0-9]*$' ,
	methodRegExp: '^[A-Z][A-Z0-9-]*$' ,
	propertyRegExp: '^(\.[a-zA-Z0-9_-]+)+$' ,
	linkPropertyRegExp: '^~[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$' ,
	idRegExp: '^[0-9a-f]{24}$' ,
	rangeRegExp: '^([0-9]+)(?:-([0-9]+))?$' ,
	slugIdRegExp: '^[a-z0-9-]{1,72}$' ,
	
	// Slugify map
	// From Django urlify.js
	/* jshint -W015 */
	asciiMapCommon: {
		// latin
		'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Æ': 'AE', 'Ç': 'C', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ì': 'I', 'Í': 'I',
		'Î': 'I', 'Ï': 'I', 'Ð': 'D', 'Ñ': 'N', 'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ő': 'O', 'Ø': 'O', 'Ù': 'U', 'Ú': 'U', 'Û': 'U',
		'Ü': 'U', 'Ű': 'U', 'Ý': 'Y', 'Þ': 'TH', 'ß': 'ss', 'à':'a', 'á':'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae', 'ç': 'c', 'è': 'e',
		'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ð': 'd', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
		'ő': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ű': 'u', 'ý': 'y', 'þ': 'th', 'ÿ': 'y', 'ẞ': 'ss',
		'œ': 'oe', 'Œ': 'OE',	// <-- moved from symbols to common
		// common
		'“': '"', '”': '"', '‘': "'", '’': "'", '…': '...'
	} ,
	asciiMapWorldAlpha: {
		// greek
		'α':'a', 'β':'b', 'γ':'g', 'δ':'d', 'ε':'e', 'ζ':'z', 'η':'h', 'θ':'8', 'ι':'i', 'κ':'k', 'λ':'l', 'μ':'m', 'ν':'n', 'ξ':'3', 'ο':'o', 'π':'p',
		'ρ':'r', 'σ':'s', 'τ':'t', 'υ':'y', 'φ':'f', 'χ':'x', 'ψ':'ps', 'ω':'w', 'ά':'a', 'έ':'e', 'ί':'i', 'ό':'o', 'ύ':'y', 'ή':'h', 'ώ':'w', 'ς':'s',
		'ϊ':'i', 'ΰ':'y', 'ϋ':'y', 'ΐ':'i', 'Α':'A', 'Β':'B', 'Γ':'G', 'Δ':'D', 'Ε':'E', 'Ζ':'Z', 'Η':'H', 'Θ':'8',
		'Ι':'I', 'Κ':'K', 'Λ':'L', 'Μ':'M', 'Ν':'N', 'Ξ':'3', 'Ο':'O', 'Π':'P', 'Ρ':'R', 'Σ':'S', 'Τ':'T', 'Υ':'Y', 'Φ':'F', 'Χ':'X', 'Ψ':'PS', 'Ω':'W',
		'Ά':'A', 'Έ':'E', 'Ί':'I', 'Ό':'O', 'Ύ':'Y', 'Ή':'H', 'Ώ':'W', 'Ϊ':'I', 'Ϋ':'Y',
		// turkish
		'ş':'s', 'Ş':'S', 'ı':'i', 'İ':'I', 'ğ':'g', 'Ğ':'G',
		//  russian
		'а':'a', 'б':'b', 'в':'v', 'г':'g', 'д':'d', 'е':'e', 'ё':'yo', 'ж':'zh', 'з':'z', 'и':'i', 'й':'j', 'к':'k', 'л':'l', 'м':'m', 'н':'n', 'о':'o',
		'п':'p', 'р':'r', 'с':'s', 'т':'t', 'у':'u', 'ф':'f', 'х':'h', 'ц':'c', 'ч':'ch', 'ш':'sh', 'щ':'sh', 'ъ':'u', 'ы':'y', 'ь':'', 'э':'e', 'ю':'yu',
		'я':'ya', 'А':'A', 'Б':'B', 'В':'V', 'Г':'G', 'Д':'D', 'Е':'E', 'Ё':'Yo', 'Ж':'Zh',
		'З':'Z', 'И':'I', 'Й':'J', 'К':'K', 'Л':'L', 'М':'M', 'Н':'N', 'О':'O', 'П':'P', 'Р':'R', 'С':'S', 'Т':'T', 'У':'U', 'Ф':'F', 'Х':'H', 'Ц':'C',
		'Ч':'Ch', 'Ш':'Sh', 'Щ':'Sh', 'Ъ':'U', 'Ы':'Y', 'Ь':'', 'Э':'E', 'Ю':'Yu', 'Я':'Ya',
		// ukranian
		'Є':'Ye', 'І':'I', 'Ї':'Yi', 'Ґ':'G', 'є':'ye', 'і':'i', 'ї':'yi', 'ґ':'g',
		// czech
		'č':'c', 'ď':'d', 'ě':'e', 'ň': 'n', 'ř':'r', 'š':'s', 'ť':'t', 'ů':'u', 'ž':'z', 'Č':'C', 'Ď':'D', 'Ě':'E', 'Ň': 'N', 'Ř':'R', 'Š':'S', 'Ť':'T',
		'Ů':'U', 'Ž':'Z',
		// polish
		'ą':'a', 'ć':'c', 'ę':'e', 'ł':'l', 'ń':'n', 'ś':'s', 'ź':'z', 'ż':'z', 'Ą':'A', 'Ć':'C', 'Ę':'e', 'Ł':'L', 'Ń':'N', 'Ś':'S',
		'Ź':'Z', 'Ż':'Z',
		// latvian
		'ā':'a', 'ē':'e', 'ģ':'g', 'ī':'i', 'ķ':'k', 'ļ':'l', 'ņ':'n', 'ū':'u', 'Ā':'A', 'Ē':'E', 'Ģ':'G', 'Ī':'i',
		'Ķ':'k', 'Ļ':'L', 'Ņ':'N', 'Ū':'u'
	} ,
	asciiMapSymbolsEn: {
		// currency
		'€': ' euro', '₢': ' cruzeiro', '₣': ' french franc', '£': ' pound', '₤': ' lira', '₥': ' mill', '₦': ' naira', '₧': ' peseta', '₨': ' rupee',
		'₩': ' won', '₪': ' new shequel', '₫': ' dong', '₭': ' kip', '₮': ' tugrik', '₯': ' drachma', '₰': ' penny', '₱': ' peso', '₲': ' guarani', '₳': ' austral',
		'₴': ' hryvnia', '₵': ' cedi', '¢': ' cent', '¥': ' yen', '元': ' yuan', '円': ' yen', '﷼': ' rial', '₠': ' ecu', '¤': ' currency', '฿': ' baht',
		"\\$": ' dollar',
		// symbols
		'©': ' (c)', '∑': ' sum', '®': ' (r)', '†': ' +', '∂': ' d', 'ƒ': ' f', '™': ' tm',
		'℠': ' sm', '˚': ' o', 'º': ' o', 'ª': ' a', '•': ' *', '∆': ' delta', '∞': ' infinity', '♥': ' love', '&': ' and', '\\|': ' or',
		'<': ' less', '>': ' greater'
	} ,
	asciiMapSymbolsFr: {
		// currency
		'€': ' euro', '₢': ' cruzeiro', '₣': ' franc', '£': ' livre', '₤': ' lire', '₥': ' mill', '₦': ' naira', '₧': ' peseta', '₨': ' rupee',
		'₩': ' won', '₪': ' new shequel', '₫': ' dong', '₭': ' kip', '₮': ' tugrik', '₯': ' drachma', '₰': ' penny', '₱': ' peso', '₲': ' guarani', '₳': ' austral',
		'₴': ' hryvnia', '₵': ' cedi', '¢': ' cent', '¥': ' yen', '元': ' yuan', '円': ' yen', '﷼': ' rial', '₠': ' ecu', '¤': ' monnaie', '฿': ' baht',
		"\\$": ' dollar',
		// symbols
		'©': ' (c)', '∑': ' sum', '®': ' (r)', '†': ' +', '∂': ' d', 'ƒ': ' f', '™': ' tm',
		'℠': ' sm', '˚': ' o', 'º': ' o', 'ª': ' a', '•': ' *', '∆': ' delta', '∞': ' infini', '♥': ' aime', '&': ' et', '\\|': ' ou',
		'<': ' moins', '>': ' plus'
	}
	/* jshint +W015 */
	
} ;

//restQuery.stringValidator.asciiMapKeys = Object.keys( restQuery.stringValidator.asciiMap ) ;



module.exports = charmap ;



},{}],3:[function(require,module,exports){
/*
	The Cedric's Swiss Knife (CSK) - CSK REST Query

	Copyright (c) 2015 - 2016 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/



// IMPORTANT: this file is shared with the client!
// We should only load the minimal stuff



// Load modules
var charmap = require( './charmap.js' ) ;
var camel = require( 'string-kit/lib/camel.js' ) ;



var pathModule = {} ;
module.exports = pathModule ;



pathModule.parse = function parse( path , isPattern )
{
	var i , iMax , j , splitted , parsed , parsedNode , error ;
	
	if ( Array.isArray( path ) ) { return path ; }	// Already parsed
	else if ( typeof path !== 'string' ) { throw new Error( "[restQuery] .parse() 'path' should be a string" ) ; }
	
	try {
		parsed = [] ;
		splitted = path.split( '/' ) ;
		
		for ( i = 0 , j = 0 , iMax = splitted.length ; i < iMax ; i ++ )
		{
			if ( splitted[ i ] === '' ) { continue ; }
			
			parsedNode = pathModule.parseNode( splitted[ i ] , isPattern ) ;
			
			if (
				j &&
				( parsedNode.type === 'property' || parsedNode.type === 'linkProperty' ) &&
				parsed[ j - 1 ].type === 'property'
			)
			{
				// Merge property node together
				parsed[ j - 1 ].identifier += '.' + parsedNode.identifier ;
				parsed[ j - 1 ].type = parsedNode.type ;
			}
			else
			{
				parsed[ j ] = parsedNode ;
				j ++ ;
			}
		}
	}
	catch ( error_ ) {
		error = new Error( "Bad URL: '" + splitted[ i ] + "' does not match any node type" ) ;
		error.type = 'badRequest' ;
		throw error ;
	}
	
	return parsed ;
} ;
                        


pathModule.parseNode = function parseNode( str , isPattern )
{
	var parsed = { node: str } , match ;
	
	if ( str.length < 1 ) { throw new Error( '[restQuery] parseNode() : argument #0 length should be >= 1' ) ; }
	if ( str.length > 72 ) { throw new Error( '[restQuery] parseNode() : argument #0 length should be <= 72' ) ; }
	
	// Firstly, check wildcard if isPattern
	if ( isPattern )
	{
		switch ( str )
		{
			case '*' :
				parsed.type = 'wildcard' ;
				parsed.wildcard = 'any' ;
				return parsed ;
			case '...' :
				parsed.type = 'wildcard' ;
				parsed.wildcard = 'anySubPath' ;
				return parsed ;
			case '[id]' :
				parsed.type = 'wildcard' ;
				parsed.wildcard = 'anyId' ;
				return parsed ;
			case '[document]' :
				parsed.type = 'wildcard' ;
				parsed.wildcard = 'anyDocument' ;
				return parsed ;
			case '[collection]' :
				parsed.type = 'wildcard' ;
				parsed.wildcard = 'anyCollection' ;
				return parsed ;
		}
	}
	
	// Then, check if it is an object's collection or method: it starts with an uppercase ascii letter
	if ( charmap.upperCaseArray.indexOf( str[ 0 ] ) !== -1 )
	{
		if ( str.length === 1 )
		{
			parsed.type = 'collection' ;
			parsed.identifier = str[ 0 ].toLowerCase() + str.slice( 1 ) ;
			return parsed ;
		}
		
		if ( charmap.lowerCaseArray.indexOf( str[ 1 ] ) !== -1 )
		{
			if ( str.match( charmap.collectionRegExp ) )
			{
				parsed.type = 'collection' ;
				parsed.identifier = str[ 0 ].toLowerCase() + str.slice( 1 ) ;
				return parsed ;
			}
			
			throw new Error( '[restQuery] parseNode() : argument #0 start with an uppercase and then a lowercase letter but mismatch a collection type' ) ;
		}
		
		if ( str.match( charmap.methodRegExp ) )
		{
			parsed.type = 'method' ;
			parsed.identifier = camel.toCamelCase( str ) ;
			return parsed ;
		}
		
		if ( str.match( charmap.collectionRegExp ) )
		{
			parsed.type = 'collection' ;
			parsed.identifier = str[ 0 ].toLowerCase() + str.slice( 1 ) ;
			return parsed ;
		}
		
		throw new Error( '[restQuery] parseNode() : argument #0 start with an uppercase but mismatch collection or method type' ) ;
	}
	
	// Then, check if it is an ID: it is a 24 characters string containing only hexadecimal.
	// It should come before slugId and offset check.
	if ( str.length === 24 && str.match( charmap.idRegExp ) )
	{
		parsed.type = 'id' ;
		parsed.identifier = str ;
		return parsed ;
	}
	
	// Then, check if it is a property
	if ( str[ 0 ] === '.' && str.match( charmap.propertyRegExp ) )
	{
		parsed.type = 'property' ;
		parsed.identifier = str.slice( 1 ) ;
		return parsed ;
	}
	
	// Then, check if it is a property link
	if ( str[ 0 ] === '~' && str.match( charmap.linkPropertyRegExp ) )
	{
		parsed.type = 'linkProperty' ;
		parsed.identifier = str.slice( 1 ) ;
		return parsed ;
	}
	
	// Then, check if it is an offset or a range
	// Should come before slugId be after id
	if ( charmap.digitArray.indexOf( str[ 0 ] ) !== -1 && ( match = str.match( charmap.rangeRegExp ) ) )
	{
		if ( match[ 2 ] )
		{
			parsed.type = 'range' ;
			parsed.min = parseInt( match[ 1 ] , 10 ) ;
			parsed.max = parseInt( match[ 2 ] , 10 ) ;
			return parsed ;
		}
		
		parsed.type = 'offset' ;
		parsed.identifier = parseInt( str , 10 ) ;
		return parsed ;
	}
	
	// Lastly, check if it is a slugId
	// Should come after id and range/offset
	if ( charmap.lowerCaseAndDigitArray.indexOf( str[ 0 ] ) !== -1 && str.match( charmap.slugIdRegExp ) )
	{
		parsed.type = 'slugId' ;
		parsed.identifier = str ;
		return parsed ;
	}
	
	// Nothing had matched... this is not a valid path node
	throw new Error( '[restQuery] parseNode() : argument #0 does not validate' ) ;
} ;



/*
	Wildcards:
		*				match any path node
		...				match any children node?
		[id]			match any ID node
		[document]		match any ID and SlugId node
		[collection]	match any collection node
*/
pathModule.match = function match( pathPattern , path )
{
	var i , iMax , iLast = 0 , iLastCollection = 0 , endWithAnySubPath , matches = {} , breakLoop ;
	
	try {
		if ( ! Array.isArray( pathPattern ) ) { pathPattern = pathModule.parse( pathPattern , true ) ; }
		if ( ! Array.isArray( path ) ) { path = pathModule.parse( path ) ; }
	}
	catch ( error ) {
		return false ;
	}
	
	endWithAnySubPath = pathPattern[ pathPattern.length - 1 ].wildcard === 'anySubPath' ;
	
	// Fast exit: just check path and pathPattern length
	if (
		( ! endWithAnySubPath && path.length !== pathPattern.length ) ||
		( endWithAnySubPath && path.length < pathPattern.length - 1 )
	)
	{
		return false ;
	}
	
	for ( i = 0 , iMax = pathPattern.length ; i < iMax && ! breakLoop ; i ++ )
	{
		if ( path[ i ] )
		{
			iLast = i ;
			if ( path[ i ].type === 'collection' && pathPattern[ i ].wildcard !== 'anySubPath' ) { iLastCollection = i ; }
		}
		
		switch ( pathPattern[ i ].wildcard )
		{
			case 'any' :
				// Always match
				break ;
				
			case 'anySubPath' :
				// Always match globally immediately!
				if ( path[ i ] )
				{
					matches.subPath = {
						type: path[ path.length - 1 ].type ,
						value: '/' + path.slice( i ).map( mapNode ).join( '/' ) ,
						node: path[ path.length - 1 ].node
					} ;
					
					matches.path = {
						type: path[ i - 1 ].type ,
						value: '/' + path.slice( 0 , i ).map( mapNode ).join( '/' ) ,
						node: path[ i - 1 ].node ,
						selectedChild: {
							type: path[ i ].type ,
							node: path[ i ].node
						}
					} ;
				}
				
				breakLoop = true ;
				break ;
				
			case 'anyId' :
				// Match any id
				if ( path[ i ].type !== 'id' ) { return false ; }
				break ;
				
			case 'anyDocument' :
				// Match any id
				if ( path[ i ].type !== 'id' && path[ i ].type !== 'slugId' ) { return false ; }
				break ;
				
			case 'anyCollection' :
				// Match any collection
				if ( path[ i ].type !== 'collection' ) { return false ; }
				break ;
				
			default :
				if ( pathPattern[ i ].type !== path[ i ].type || pathPattern[ i ].identifier !== path[ i ].identifier )
				{
					return false ;
				}
		}
	}
	
	
	if ( ! matches.path )
	{
		matches.path = {
			type: path[ iLast ].type ,
			value: '/' + path.map( mapNode ).join( '/' ) ,
			node: path[ iLast ].node
		} ;
	}
	
	matches.collectionPath = {
		type: path[ iLastCollection ].type ,
		value: '/' + path.slice( 0 , iLastCollection + 1 ).map( mapNode ).join( '/' ) ,
		node: path[ iLastCollection ].node
	} ;
	
	return matches ;
} ;



// a callback for .map() that returns the .node property
function mapNode( e ) { return e.node ; }




},{"./charmap.js":2,"string-kit/lib/camel.js":4}],4:[function(require,module,exports){
/*
	The Cedric's Swiss Knife (CSK) - CSK string toolbox

	Copyright (c) 2014 - 2015 Cédric Ronvel 
	
	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/



var camel = {} ;
module.exports = camel ;



// Transform alphanum separated by underscore or minus to camel case
camel.toCamelCase = function toCamelCase( str )
{
	if ( ! str || typeof str !== 'string' ) { return '' ; }
	
	return str.replace( /^[\s_-]*([^\s_-]+)|[\s_-]+([^\s_-]?)([^\s_-]*)/g , function( match , firstWord , firstLetter , endOfWord ) {
		
		if ( firstWord ) { return firstWord.toLowerCase() ; }
		if ( ! firstLetter ) { return '' ; }
		return firstLetter.toUpperCase() + endOfWord.toLowerCase() ;
	} ) ;
} ;



// Transform camel case to alphanum separated by minus
camel.camelCaseToDashed = function camelCaseToDashed( str )
{
	if ( ! str || typeof str !== 'string' ) { return '' ; }
	
	return str.replace( /^([A-Z])|([A-Z])/g , function( match , firstLetter , letter ) {
		
		if ( firstLetter ) { return firstLetter.toLowerCase() ; }
		return '-' + letter.toLowerCase() ;
	} ) ;
} ;



},{}]},{},[1])(1)
});