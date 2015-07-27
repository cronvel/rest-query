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

var ErrorStatus = require( 'error-status' ) ; 
var async = require( 'async-kit' ) ; 
var odm = require( 'odm-kit' ) ; 





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
	
	//return odm.collection ;
} ;



Node.parsePathNode = function parsePathNode( str )
{
	if ( typeof str !== 'string' ) { return new TypeError( '[restQuery] parsePathNode() : argument #0 should be a string' ) ; }
	
	if ( str.length < 1 ) { return new Error( '[restQuery] parsePathNode() : argument #0 length should be > 1' ) ; }
	if ( str.length > 72 ) { return new Error( '[restQuery] parsePathNode() : argument #0 length should be <= 72' ) ; }
	
	
	// Firstly, check if it is an object's member (or method): it starts with an uppercase ascii letter
	if ( restQuery.charmap.uppercaseArray.indexOf( str[ 0 ] ) !== -1 )
	{
		if ( ! str.match( restQuery.charmap.memberRegExp ) )
		{
			return new Error( '[restQuery] parsePathNode() : argument #0 start with an uppercase but mismatch an object member type' ) ;
		}
		
		return {
			type: 'member' ,
			identifier: str[ 0 ].toLowerCase() + str.slice( 1 )
		} ;
	}
	
	// Secondly, check if it is an ID: it is a 24 characters string containing only hexadecimal
	if ( str.length === 24 && str.match( restQuery.charmap.idRegExp ) )
	{
		return {
			type: 'ID' ,
			identifier: str
		} ;
	}
	
	// Thirdly, check if it is an offset
	if ( str.match( restQuery.charmap.offsetRegExp ) )
	{
		return {
			type: 'offset' ,
			identifier: parseInt( str )
		} ;
	}
	
	// Fourthly, check if it is a slugId
	if ( str.match( restQuery.charmap.sidRegExp ) )
	{
		return {
			type: 'slugId' ,
			identifier: str
		} ;
	}
	
	// Nothing had matched... this is not a valid path node
	return new Error( '[restQuery] parsePathNode() : argument #0 does not validate' ) ;
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
		ancestorObjectNodes = param.ancestorObjectNodes ,
		access = param.access ,
		accessCache ;
	
	// Get / create access cache for this performer
	accessCache = performer.accessCache.get( object ) ;
	
	if ( ! accessCache )
	{
		accessCache = {
			granted: restQuery.accessLevel.NONE ,
			denied: restQuery.accessLevel.ALL + 1
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
		if ( object.otherAccess >= access ) { localCallback() ; return ; }
		
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
			
			userId = user._id.toString() ;
			
			// Access granted by 'userAccess'
			if ( userId in object.userAccess && object.userAccess[ userId ] >= access )
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
					if ( groups[ i ] in object.groupAccess && object.groupAccess[ groups[ i ] ] >= access )
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
				object: ancestorObjectNodes[ 0 ].object.$ || ancestorObjectNodes[ 0 ].object ,
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
					object: ancestorObjectNodes[ 0 ].object.$ || ancestorObjectNodes[ 0 ].object ,
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




