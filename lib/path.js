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



