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

"use strict" ;



// Load modules
var restQuery = require( './restQuery.js' ) ;

var ErrorStatus = require( 'error-status' ) ; 
var async = require( 'async-kit' ) ; 
var tree = require( 'tree-kit' ) ; 
var string = require( 'string-kit' ) ; 
var qs = require( 'qs-kit' ) ; 

var log = require( 'logfella' ).global.use( 'rest-query' ) ;

//var rootsDb = require( 'roots-db' ) ; 





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



/*
	Common context object (get/post/put/patch/delete):
	
		* performer
		* parentNode
		* ancestorObjectNodes
		* query (optional)
*/



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.get = function collectionNodeGet( pathParts , context , callback )
{
	if ( typeof context === 'function' ) { callback = context ; context = {} ; }
	
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
	
	if ( ! context.output ) { context.output = {} ; }
	
	context.input = {
		method: 'get' ,
		pathParts: pathParts ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;
	
	// Default tier: 3 or 5 if the performer is system
	context.input.tier = context.tier ||
		( context.input && context.input.tier ) ||
		( context.input.performer && context.input.performer.system ? 5 : 3 ) ;
	
	// Default populate tier: 3 or 5 if the performer is system
	context.input.pTier = context.pTier ||
		( context.input && context.input.pTier ) ||
		( context.input.performer && context.input.performer.system ? 5 : 3 ) ;
	
	return this._get( pathParts , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.post = function collectionNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( typeof context === 'function' ) { callback = context ; context = {} ; }
	
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
	
	if ( ! context.output ) { context.output = {} ; }
	
	context.input = {
		method: 'post' ,
		pathParts: pathParts ,
		document: incomingDocument ,
		attachmentStreams: attachmentStreams ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;
	
	return this._post( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.put = function collectionNodePut( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( typeof context === 'function' ) { callback = context ; context = {} ; }
	
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
	
	if ( ! context.output ) { context.output = {} ; }
	
	context.input = {
		method: 'put' ,
		pathParts: pathParts ,
		document: incomingDocument ,
		attachmentStreams: attachmentStreams ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;
	
	return this._put( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.patch = function collectionNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( typeof context === 'function' ) { callback = context ; context = {} ; }
	
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
	
	if ( ! context.output ) { context.output = {} ; }
	
	context.input = {
		method: 'patch' ,
		pathParts: pathParts ,
		document: incomingDocument ,
		attachmentStreams: attachmentStreams ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;
	
	return this._patch( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.delete = function collectionNodeDelete( pathParts , context , callback )
{
	if ( typeof context === 'function' ) { callback = context ; context = {} ; }
	
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
	
	if ( ! context.output ) { context.output = {} ; }
	
	context.input = {
		method: 'delete' ,
		pathParts: pathParts ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;
	
	return this._delete( pathParts , context , callback ) ;
} ;



// autoSlugId: the current collection will be assumed if a slugId is given
Node.prototype.contains = function contains( collectionNode , autoSlugId )
{
	if ( ! ( collectionNode instanceof restQuery.CollectionNode ) ) { throw new Error( '[restQuery] .constains() require argument #0 to be an instance of restQuery.CollectionNode' ) ; }
	
	// First check the child name
	if ( this.children[ collectionNode.name ] )
	{
		// This is not an error ATM, since contains() is called by the tree, and an element can be in many place of it.
		// So just return, doing nothing.
		//throw new Error( '[restQuery] Cannot attach over an existing child: ' + this.children[ collectionNode.name ] ) ;
		return ;
	}
	
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
// /!\ Should check if populate field is OK.
// /!\ Don't know if the whole "populate security model" should be checked here, or if this is just an anti-WTF filter.
// /!\ merge that with CollectionNode.prototype.populateObjectMask() ?
Node.prototype.checkPopulate = function checkPopulate( populate )
{
	// TODO...
	return populate ;
} ;



// Check access on an object
Node.checkAccess = function checkAccess( performer , accessType , accessLevel , collectionNode , object , ancestorObjectNodes , callback )	// jshint ignore:line
{
	var k , i , iMax , depth ,
		publicAccess , userAccess , groupAccess ,
		hasUserAccess , hasGroupAccess , hasUserAccessInheritance , hasGroupAccessInheritance ;
	
	log.debug( "Check access %s %i" , accessType , accessLevel ) ;
	//console.log( "object:" , object ) ;
	//console.log( "ancestors:" , ancestorObjectNodes ) ;
	
	
	// Access granted: "system" is always right!
	if ( performer.system )
	{
		log.debug( 'Granted: "system" is always right' ) ;
		callback() ;
		return ;
	}
	
	
	/*
		Tmp? Should this test should be done elsewhere, at collection traversing time?
		That complicated, since we cannot predict which kind of access is needed.
		E.g. PUT /Users/[id] can be either a create or a modify, we only now after checking the DB for the ID,
		POST has different meaning as well.
	*/
	// Access denied by collection's 'restrictAccess'
	if ( collectionNode && collectionNode.restrictAccess && ( collectionNode.restrictAccess[ accessType ] || 0 ) < accessLevel )
	{
		log.debug( "Denied by collection restrictAccess: %J" , collectionNode.restrictAccess ) ;
		callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
		return ;
	}
	
	
	// Access granted by 'publicAccess'
	if ( ( object.publicAccess[ accessType ] || 0 ) >= accessLevel )
	{
		log.debug( "Granted by publicAccess: %J" , object.publicAccess ) ;
		callback() ;
		return ;
	}
	
	
	// Check if there is at least one userAccess and one groupAccess
	for ( k in object.userAccess ) { hasUserAccess = true ; break ; }
	for ( k in object.groupAccess ) { hasGroupAccess = true ; break ; }
	
	
	// Check if some ancestors have inheritance
	for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ )
	{
		depth = i + 1 ;
		publicAccess = ancestorObjectNodes[ i ].object.publicAccess ;
		
		// Access granted by inherited 'publicAccess'
		if (
			publicAccess.inheritance &&
			publicAccess.inheritance.depth >= depth &&
			( publicAccess.inheritance[ accessType ] || 0 ) >= accessLevel
		)
		{
			log.debug( "Granted by inherited publicAccess: %J" , publicAccess ) ;
			callback() ;
			return ;
		}
		
		userAccess = ancestorObjectNodes[ i ].object.userAccess ;
		for ( k in userAccess )
		{
			if ( userAccess[ k ].inheritance && userAccess[ k ].inheritance.depth >= depth )
			{
				hasUserAccessInheritance = true ;
				break ;
			}
		}
		
		groupAccess = ancestorObjectNodes[ i ].object.groupAccess ;
		for ( k in groupAccess )
		{
			if ( groupAccess[ k ].inheritance && groupAccess[ k ].inheritance.depth >= depth )
			{
				hasGroupAccessInheritance = true ;
				break ;
			}
		}
	}
	
	// Quickly exit if no particular access exists on this resource
	if ( ! hasUserAccess && ! hasGroupAccess && ! hasUserAccessInheritance && ! hasGroupAccessInheritance )
	{
		log.debug( "Denied: no public access, and no user and group access defined: %J" , object.publicAccess ) ;
		callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
		return ;
	}
	
	
	
	
	performer.getUser( function( error , user ) {
		
		var i , iMax , userId , depth , userAccess ;
		
		if ( error ) { log.debug( "Denied by: %E" , error ) ; callback( error ) ; return ; }
		
		// Access denied, performer should be connected
		if ( ! user )
		{
			log.debug( "Denied: no public access and not connected" ) ;
			callback( ErrorStatus.unauthorized( "Public access forbidden." ) ) ;
			return ;
		}
		
		userId = user.$.id.toString() ;
		
		// Access granted by 'userAccess'
		if ( userId in object.userAccess && object.userAccess[ userId ][ accessType ] >= accessLevel )
		{
			log.debug( "Granted by publicAccess: %J" , object.userAccess[ userId ] ) ;
			callback() ;
			return ;
		}
		
		// Access granted by inherited 'userAccess'
		if ( hasUserAccessInheritance )
		{
			for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ )
			{
				depth = i + 1 ;
				userAccess = ancestorObjectNodes[ i ].object.userAccess ;
				
				if (
					userId in userAccess &&
					userAccess[ userId ].inheritance &&
					userAccess[ userId ].inheritance.depth >= depth &&
					( userAccess[ userId ].inheritance[ accessType ] || 0 ) >= accessLevel
				)
				{
					log.debug( "Granted by inherited publicAccess: %J" , userAccess[ userId ] ) ;
					callback() ;
					return ;
				}
			}
		}
		
		
		// Quickly exit if no group access exist on this resource
		if ( ! hasGroupAccess && ! hasGroupAccessInheritance )
		{
			log.debug( "Denied: no public and user access and no group defined" ) ;
			callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
			return ;
		}
		
		
		performer.getGroups( function( error , groups ) {
			
			var i , iMax , j , jMax , groupId , depth , groupAccess ;
			
			//console.log( "Groups: " , groups ) ;
			
			// Check each group of the user
			for ( j = 0 , jMax = groups.length ; j < jMax ; j ++ )
			{
				groupId = groups[ j ].toString() ;
				//console.log( "Checking group: " , groupId ) ;
				
				// Access granted by 'groupAccess'
				if ( groupId in object.groupAccess && object.groupAccess[ groupId ][ accessType ] >= accessLevel )
				{
					log.debug( "Granted by groupAccess: %J" , object.groupAccess[ groupId ] ) ;
					callback() ;
					return ;
				}
				
				// Access granted by inherited 'groupAccess'
				if ( hasGroupAccessInheritance )
				{
					for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ )
					{
						depth = i + 1 ;
						groupAccess = ancestorObjectNodes[ i ].object.groupAccess ;
						
						if (
							groupId in groupAccess &&
							groupAccess[ groupId ].inheritance &&
							groupAccess[ groupId ].inheritance.depth >= depth &&
							( groupAccess[ groupId ].inheritance[ accessType ] || 0 ) >= accessLevel
						)
						{
							log.debug( "Granted by inherited groupAccess: %J" , groupAccess[ groupId ] ) ;
							callback() ;
							return ;
						}
					}
				}
			}
			
			
			// Nothing has granted access to this connected performer, so access is denied
			log.debug( "Denied: all potential grant sources have been exhausted without success" ) ;
			callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
		} ) ;
	} ) ;
} ;


