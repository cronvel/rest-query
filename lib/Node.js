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



// Load modules
var restQuery = require( './restQuery.js' ) ;
var accessLevel = restQuery.accessLevel ;

var ErrorStatus = require( 'error-status' ) ; 
var async = require( 'async-kit' ) ; 
var string = require( 'string-kit' ) ; 
var rootsDb = require( 'roots-db' ) ; 





			/* Common Node -- shared between ObjectNode & CollectionNode */



function Node() { throw new Error( '[restQuery] Cannot create a Node object directly' ) ; }
module.exports = Node ;

Node.prototype.constructor = Node ;



Node.create = function createNode( app , node , children )
{
	if ( ! node ) { node = Object.create( Node.prototype ) ; }
	if ( ! children || typeof children !== 'object' ) { children = {} ; }
	
	Object.defineProperties( node , {
		app: { value: app , enumerable: true } ,
		children: { value: children , enumerable: true }
	} ) ;
	
	return node ;
} ;



// autoSlugId: the current collection will be assumed if a slugId is given
Node.prototype.contains = function contains( collectionNode , autoSlugId )
{
	if ( ! ( collectionNode instanceof restQuery.CollectionNode ) ) { throw new Error( '[restQuery] .constains() require argument #0 to be an instance of restQuery.CollectionNode' ) ; }
	
	// First check the child name
	if ( this.children[ collectionNode.name ] ) { throw new Error( '[restQuery] Cannot attach over an existing child: ' + this.children[ collectionNode.name ] ) ; }
	this.children[ collectionNode.name ] = collectionNode ;
	
	//return rootsDb.collection ;
} ;



Node.prototype.parsePath = function parsePath( path )
{
	var i , iMax , j , splitted , parsed , parsedNode ;
	
	if ( Array.isArray( path ) ) { return path ; }	// Already parsed
	else if ( typeof path !== 'string' ) { throw new Error( "[restQuery] .parsePath() 'path' should be a string" ) ; }
	
	try {
		parsed = [] ;
		splitted = path.split( '/' ) ;
		
		for ( i = 0 , j = 0 , iMax = splitted.length ; i < iMax ; i ++ )
		{
			if ( splitted[ i ] === '' ) { continue ; }
			
			parsedNode = Node.parsePathNode( splitted[ i ] ) ;
			
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
	catch ( error ) {
		return ErrorStatus.badRequest( { message: "Bad URL: '" + splitted[ i ] + "' does not match any node type" } ) ;
	}
	
	//# debug : console.log( '[restQuery] .parsePath():' , path ) ;
	
	return parsed ;
} ;
                        


Node.parsePathNode = function parsePathNode( str )
{
	var indexOf , parsed = {} , match ;
	
	if ( str.length < 1 ) { throw new Error( '[restQuery] parsePathNode() : argument #0 length should be >= 1' ) ; }
	if ( str.length > 72 ) { throw new Error( '[restQuery] parsePathNode() : argument #0 length should be <= 72' ) ; }
	
	// Firstly, check if it is an object's collection or method: it starts with an uppercase ascii letter
	if ( restQuery.charmap.upperCaseArray.indexOf( str[ 0 ] ) !== -1 )
	{
		if ( str.length === 1 )
		{
			parsed.type = 'collection' ;
			parsed.identifier = str[ 0 ].toLowerCase() + str.slice( 1 ) ;
			return parsed ;
		}
		
		if ( restQuery.charmap.lowerCaseArray.indexOf( str[ 1 ] ) !== -1 )
		{
			if ( str.match( restQuery.charmap.collectionRegExp ) )
			{
				parsed.type = 'collection' ;
				parsed.identifier = str[ 0 ].toLowerCase() + str.slice( 1 ) ;
				return parsed ;
			}
			
			throw new Error( '[restQuery] parsePathNode() : argument #0 start with an uppercase and then a lowercase letter but mismatch a collection type' ) ;
		}
		
		if ( str.match( restQuery.charmap.methodRegExp ) )
		{
			parsed.type = 'method' ;
			parsed.identifier = string.toCamelCase( str ) ;
			return parsed ;
		}
		
		if ( str.match( restQuery.charmap.collectionRegExp ) )
		{
			parsed.type = 'collection' ;
			parsed.identifier = str[ 0 ].toLowerCase() + str.slice( 1 ) ;
			return parsed ;
		}
		
		throw new Error( '[restQuery] parsePathNode() : argument #0 start with an uppercase but mismatch collection or method type' ) ;
	}
	
	// Secondly, check if it is an ID: it is a 24 characters string containing only hexadecimal.
	// It should come before slugId and offset check.
	if ( str.length === 24 && str.match( restQuery.charmap.idRegExp ) )
	{
		parsed.type = 'id' ;
		parsed.identifier = str ;
		return parsed ;
	}
	
	// Then, check if it is a property
	if ( str[ 0 ] === '.' && str.match( restQuery.charmap.propertyRegExp ) )
	{
		parsed.type = 'property' ;
		parsed.identifier = str.slice( 1 ) ;
		return parsed ;
	}
	
	// Then, check if it is a property link
	if ( str[ 0 ] === '~' && str.match( restQuery.charmap.linkPropertyRegExp ) )
	{
		parsed.type = 'linkProperty' ;
		parsed.identifier = str.slice( 1 ) ;
		return parsed ;
	}
	
	// Then, check if it is an offset or a range
	// Should come before slugId be after id
	if ( restQuery.charmap.digitArray.indexOf( str[ 0 ] ) !== -1 && ( match = str.match( restQuery.charmap.rangeRegExp ) ) )
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
	if ( restQuery.charmap.lowerCaseAndDigitArray.indexOf( str[ 0 ] ) !== -1 && str.match( restQuery.charmap.slugIdRegExp ) )
	{
		parsed.type = 'slugId' ;
		parsed.identifier = str ;
		return parsed ;
	}
	
	// Nothing had matched... this is not a valid path node
	throw new Error( '[restQuery] parsePathNode() : argument #0 does not validate' ) ;
} ;



/*
	Named parameters:
		* access
		* object
		* ancestorObjectNodes
		* performer
		* ancestryCheck
*/
Node.checkAccess = function checkAccess( param , callback )
{
	var object = param.object ,
		performer = param.performer ,
		ancestorObjectNodes = param.ancestorObjectNodes || [] ,
		access = typeof param.access === 'string' ? accessLevel[ param.access ] : param.access ,
		accessCache ;
	
	// Get / create access cache for this performer
	accessCache = performer.accessCache.get( object ) ;
	
	if ( ! accessCache )
	{
		accessCache = {
			granted: restQuery.accessLevel.none ,
			denied: restQuery.accessLevel.all + 1
		} ;
		
		performer.accessCache.set( object , accessCache ) ;
	}
	
	// Check access cache
	if ( access <= accessCache.granted )
	{
		callback() ;
		return ;
	}
	else if ( access >= accessCache.denied )
	{
		callback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
		return ;
	}
	
	
	// Check local access, without any inheritance
	var localObjectAccess = function localObjectAccess( object , localCallback )
	{
		var k , hasUserAccess , hasGroupAccess ;
		
		// Access granted by 'otherAccess'
		if ( accessLevel[ object.otherAccess ] >= access ) { localCallback() ; return ; }
		
		/*	This does not work until the 'roots-db' refacto of the ODM
		hasUserAccess = Object.keys( object.userAccess ).length ;
		hasGroupAccess = Object.keys( object.groupAccess ).length ;
		*/
		
		for ( k in object.userAccess ) { hasUserAccess = true ; break ; }
		for ( k in object.groupAccess ) { hasGroupAccess = true ; break ; }
		
		
		// Quickly exit if no particular access exist on this resource
		if ( ! hasUserAccess && ! hasGroupAccess )
		{
			localCallback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
			return ;
		}
		
		performer.getUser( function( error , user ) {
			
			var userId ;
			
			if ( error ) { localCallback( error ) ; return ; }
			
			// Access denied, performer should be connected
			if ( ! user ) { localCallback( ErrorStatus.unauthorized( { message: "Public access forbidden." } ) ) ; return ; }
			
			userId = user.$.id.toString() ;
			
			// Access granted by 'userAccess'
			if ( userId in object.userAccess && accessLevel[ object.userAccess[ userId ] ] >= access )
			{
				localCallback() ;
				return ;
			}
			
			
			// Quickly exit if no group access exist on this resource
			if ( ! hasGroupAccess )
			{
				localCallback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
				return ;
			}
			
			
			performer.getGroups( function( error , groups ) {
				
				var i ;
				
				//console.log( "Groups: " , groups ) ;
				
				// /!\ Ideally we should either iterate over user's group or resource's group, whatever array is shorter /!\
				
				for ( i = 0 ; i < groups.length ; i ++ )
				{
					if ( groups[ i ] in object.groupAccess && accessLevel[ object.groupAccess[ groups[ i ] ] ] >= access )
					{
						localCallback() ;
						return ;
					}
				}
				
				// Nothing has granted access to this connected performer, so access is denied
				localCallback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
			} ) ;
		} ) ;
	} ;
	
	
	
	if ( object.inheritAccess === 'all' && ancestorObjectNodes.length )
	{
		Node.checkAccess( {
				access: access ,
				object: ancestorObjectNodes[ 0 ].object ,
				ancestorObjectNodes: ancestorObjectNodes.slice( 1 ) ,
				performer: performer
			} ,
			function( error ) {
				if ( error )
				{
					if ( access < accessCache.denied ) { accessCache.denied = access ; }
					callback( error ) ;
				}
				else
				{
					if ( access > accessCache.granted ) { accessCache.granted = access ; }
					callback() ;
				}
			}
		) ;
	}
	else if ( ( object.inheritAccess === 'min' || object.inheritAccess === 'max' ) && ancestorObjectNodes.length )
	{
		localObjectAccess( object , function( error ) {
			
			if ( error && object.inheritAccess === 'min' )
			{
				if ( access < accessCache.denied ) { accessCache.denied = access ; }
				callback( error ) ;
				return ;
			}
			else if ( ! error && object.inheritAccess === 'max' )
			{
				if ( access > accessCache.granted ) { accessCache.granted = access ; }
				callback() ;
				return ;
			}
			
			Node.checkAccess( {
					access: access ,
					object: ancestorObjectNodes[ 0 ].object ,
					ancestorObjectNodes: ancestorObjectNodes.slice( 1 ) ,
					performer: performer
				} ,
				function( error ) {
					if ( error )
					{
						if ( access < accessCache.denied ) { accessCache.denied = access ; }
						callback( error ) ;
					}
					else
					{
						if ( access > accessCache.granted ) { accessCache.granted = access ; }
						callback() ;
					}
				}
			) ;
		} ) ;
	}
	else //if ( object.inheritAccess === 'none' )
	{
		// inheritAccess: 'none' is the default
		localObjectAccess( object , function( error ) {
			if ( error )
			{
				if ( access < accessCache.denied ) { accessCache.denied = access ; }
				callback( error ) ;
			}
			else
			{
				if ( access > accessCache.granted ) { accessCache.granted = access ; }
				callback() ;
			}
		} ) ;
	}
} ;




