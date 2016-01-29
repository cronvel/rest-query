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



// Load modules
var restQuery = require( './restQuery.js' ) ;
var accessLevel = restQuery.accessLevel ;

var ErrorStatus = require( 'error-status' ) ; 
var async = require( 'async-kit' ) ; 
var tree = require( 'tree-kit' ) ; 
var string = require( 'string-kit' ) ; 
var qs = require( 'qs-kit' ) ; 
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



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.get = function collectionNodeGet( pathParts , context , callback )
{
	if ( ! Array.isArray( pathParts ) )
	{
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
	}
	
	if ( ! context || typeof context !== 'object' )
	{
		if ( typeof context === 'function' ) { callback = context ; }
		context = {} ;
	}
	
	if ( ! context.performer ) { context.performer = this.app.createPerformer() ; }
	if ( ! context.query ) { context.query = {} ; }
	
	return this._get( pathParts , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.post = function collectionNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! Array.isArray( pathParts ) )
	{
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
	}
	
	if ( ! context || typeof context !== 'object' )
	{
		if ( typeof context === 'function' ) { callback = context ; }
		context = {} ;
	}
	
	if ( ! context.performer ) { context.performer = this.app.createPerformer() ; }
	if ( ! context.query ) { context.query = {} ; }
	
	return this._post( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.put = function collectionNodePut( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! Array.isArray( pathParts ) )
	{
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
	}
	
	if ( ! context || typeof context !== 'object' )
	{
		if ( typeof context === 'function' ) { callback = context ; }
		context = {} ;
	}
	
	if ( ! context.performer ) { context.performer = this.app.createPerformer() ; }
	if ( ! context.query ) { context.query = {} ; }
	
	return this._put( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.patch = function collectionNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! Array.isArray( pathParts ) )
	{
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
	}
	
	if ( ! context || typeof context !== 'object' )
	{
		if ( typeof context === 'function' ) { callback = context ; }
		context = {} ;
	}
	
	if ( ! context.performer ) { context.performer = this.app.createPerformer() ; }
	if ( ! context.query ) { context.query = {} ; }
	
	return this._patch( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.delete = function collectionNodeDelete( pathParts , context , callback )
{
	if ( ! Array.isArray( pathParts ) )
	{
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			callback( error ) ;
			return ;
		}
	}
	
	if ( ! context || typeof context !== 'object' )
	{
		if ( typeof context === 'function' ) { callback = context ; }
		context = {} ;
	}
	
	if ( ! context.performer ) { context.performer = this.app.createPerformer() ; }
	if ( ! context.query ) { context.query = {} ; }
	
	return this._delete( pathParts , context , callback ) ;
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



// Transform common internal errors to user errors, if it is...
Node.transformError =
Node.prototype.transformError = function transformError( error )
{
	if ( error.validatorMessage )
	{
		return ErrorStatus.badRequest( {
			message: "Document not validated: " + error.validatorMessage ,
			stack: error.stack
		} ) ;
	}
	
	return error ;
} ;



// TODO...
Node.parseQuery = function parseQuery( query_ )
{
	var query = {} ;
	
	if ( query_.populate )
	{
		query.populate = query_.populate ;
	}
	
	return query ;
} ;



// TODO...
// Should check if populate field is OK.
// Don't know if the whole "populate security model" should be checked here, or if this is just an anti-WTF filter.
Node.prototype.checkPopulate = function checkPopulate( populate )
{
	// TODO...
	return populate ;
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
	
	
	
	if ( ! ancestorObjectNodes.length || ! object.inheritAccess || object.inheritAccess === 'none' )
	{
		// inheritAccess: 'none' is the default
		Node.checkLocalObjectAccess( access , performer , object , function( error ) {
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
	else if ( object.inheritAccess === 'all' )
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
	else if ( object.inheritAccess === 'min' || object.inheritAccess === 'max' )
	{
		Node.checkLocalObjectAccess( access , performer , object , function( error ) {
			
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
	else
	{
		callback( ErrorStatus.badRequest( { message: "Bad inheritAccess: " + object.inheritAccess } ) ) ;
	}
} ;



// Check local access on an object, without any inheritance
Node.checkLocalObjectAccess = function checkLocalObjectAccess( access , performer , object , localCallback )
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














// --------------------------- new



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
	
	
	
	if ( ! ancestorObjectNodes.length || ! object.inheritAccess || object.inheritAccess === 'none' )
	{
		// inheritAccess: 'none' is the default
		Node.checkLocalObjectAccess( access , performer , object , function( error ) {
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
	else if ( object.inheritAccess === 'all' )
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
	else if ( object.inheritAccess === 'min' || object.inheritAccess === 'max' )
	{
		Node.checkLocalObjectAccess( access , performer , object , function( error ) {
			
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
	else
	{
		callback( ErrorStatus.badRequest( { message: "Bad inheritAccess: " + object.inheritAccess } ) ) ;
	}
} ;



/*
TODO:

OK	Basic local access
OK	getUser()/getGroup() and inheritance order, to save requests
*/

// Check local access on an object, without any inheritance
Node.checkLocalObjectAccess = function checkLocalObjectAccess( accessType , minLevel , performer , object , localCallback )
{
	var i , iMax , j , jMax , hasUserAccess , hasGroupAccess , hasInheritance ;
	
	// Access granted by 'otherAccess'
	//if ( accessLevel[ object.otherAccess ] >= accessType ) { localCallback() ; return ; }
	if ( ( object.otherAccess[ accessType ] || 0 ) >= minLevel ) { localCallback() ; return ; }
	
	hasUserAccess = Object.keys( object.userAccess ).length ;
	hasGroupAccess = Object.keys( object.groupAccess ).length ;
	
	// Check if the parent has 'allowAccessInheritance' to a sufficient level
	for ( i = 0 , iMax = ancestorObjects.length ; i < iMax ; i ++ )
	{
		if ( ancestorObjects[ i ].accessInheritanceDepth >= iMax - i )
		{
			inheritance.push( ancestorObjects[ i ] ) ;
		}
	}
	
	// Access granted by inherited 'otherAccess'
	for ( i = 0 , iMax = ancestorObjects.length ; i < iMax ; i ++ )
	{
		if ( ancestorObjects[ i ].accessInheritanceDepth >= iMax - i )
		{
			// Store if we have some inheritance, to early eventually early exit
			hasInheritance = true ;
			
			if (
				ancestorObjects[ i ].otherAccess.inheritance &&
				ancestorObjects[ i ].otherAccess.inheritance.depth >= iMax - i &&
				( ancestorObjects[ i ].otherAccess.inheritance[ accessType ] || 0 ) >= minLevel
			)
			{
				localCallback() ;
				return ;
			}
		}
	}
	
	// Quickly exit if no particular access exist on this resource
	if ( ! hasUserAccess && ! hasGroupAccess && ! hasInheritance )
	{
		localCallback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
		return ;
	}
	
	
	
	
	performer.getUser( function( error , user ) {
		
		var i , iMax , userId ;
		
		if ( error ) { localCallback( error ) ; return ; }
		
		// Access denied, performer should be connected
		if ( ! user ) { localCallback( ErrorStatus.unauthorized( { message: "Public access forbidden." } ) ) ; return ; }
		
		userId = user.$.id.toString() ;
		
		// Access granted by 'userAccess'
		//if ( userId in object.userAccess && accessLevel[ object.userAccess[ userId ] ] >= accessType )
		if ( userId in object.userAccess && object.userAccess[ userId ][ accessType ] >= minLevel )
		{
			localCallback() ;
			return ;
		}
		
		// Access granted by inherited 'userAccess'
		if ( hasInheritance )
		{
			for ( i = 0 , iMax = ancestorObjects.length ; i < iMax ; i ++ )
			{
				if (
					ancestorObjects[ i ].accessInheritanceDepth >= iMax - i &&
					userId in ancestorObjects[ i ].userAccess &&
					ancestorObjects[ i ].userAccess[ userId ].inheritance &&
					ancestorObjects[ i ].userAccess[ userId ].inheritance.depth >= iMax - i &&
					( ancestorObjects[ i ].userAccess[ userId ].inheritance[ accessType ] || 0 ) >= minLevel
				)
				{
					localCallback() ;
					return ;
				}
			}
		}
		
		
		// Quickly exit if no group access exist on this resource
		if ( ! hasGroupAccess )
		{
			localCallback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
			return ;
		}
		
		
		performer.getGroups( function( error , groups ) {
			
			var i , iMax , j , jMax , groupId ;
			
			// Check each group of the user
			for ( j = 0 , jMax = groups.length ; j < jMax ; j ++ )
			{
				groupId = groups[ j ].toString() ;
				
				// Access granted by 'groupAccess'
				if ( groupId in object.groupAccess && object.groupAccess[ groupId ][ accessType ] >= minLevel )
				{
					localCallback() ;
					return ;
				}
				
				// Access granted by inherited 'groupAccess'
				if ( hasInheritance )
				{
					for ( i = 0 , iMax = ancestorObjects.length ; i < iMax ; i ++ )
					{
						if (
							ancestorObjects[ i ].accessInheritanceDepth >= iMax - i &&
							groupId in ancestorObjects[ i ].groupAccess &&
							ancestorObjects[ i ].groupAccess[ groupId ].inheritance &&
							ancestorObjects[ i ].groupAccess[ groupId ].inheritance.depth >= iMax - i &&
							( ancestorObjects[ i ].groupAccess[ groupId ].inheritance[ accessType ] || 0 ) >= minLevel
						)
						{
							localCallback() ;
							return ;
						}
					}
				}
			}
			
			
			// Nothing has granted access to this connected performer, so access is denied
			localCallback( ErrorStatus.forbidden( { message: "Access forbidden." } ) ) ;
		} ) ;
	} ) ;
} ;


