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
var ErrorStatus = require( 'error-status' ) ;
var doormen = require( 'doormen' ) ;
var async = require( 'async-kit' ) ;

var restQuery = require( './restQuery.js' ) ;
var log = require( 'logfella' ).global.use( 'rest-query' ) ;





			/* CollectionNode */



function CollectionNode() { throw new Error( '[restQuery] Cannot create a CollectionNode object directly' ) ; }
module.exports = CollectionNode ;

CollectionNode.prototype = Object.create( restQuery.Node.prototype ) ;
CollectionNode.prototype.constructor = CollectionNode ;



// WIP... Some parts are copy of roots-db collection schema...

// restQuery only accept a single hook per type
var restQueryHookSchema = {
	type: 'function' ,
	optional: true
} ;

CollectionNode.schema = {
	type: 'strictObject',
	extraProperties: true,
	properties: {
		properties: {
			type: 'strictObject',
			default: {}
		},
		defaultAccessLevel: { type: 'restQuery.accessLevel' , default: 'read' } ,
		defaultInheritAccess: { type: 'restQuery.inheritAccess' , default: 'none' } ,
		slugGenerationProperty: { type: 'string' , default: null } ,
		slugGenerationOptions: { type: 'strictObject' , default: {} } ,
		autoCollection: { type: 'string' , default: null } ,
		hooks: {
			type: 'strictObject' ,
			default: {} ,
			extraProperties: true ,
			properties: {
				beforeCreate: restQueryHookSchema ,
				beforeModify: restQueryHookSchema ,
				beforeDelete: restQueryHookSchema ,
			}
		}
	}
} ;



CollectionNode.create = function createCollectionNode( app , name , schema , collectionNode )
{
	var collection , restQueryName ;
	
	if ( ! collectionNode ) { collectionNode = Object.create( restQuery.CollectionNode.prototype ) ; }
	
	// Do not apply on derivative of CollectionNode, they should define their own defaults
	if ( collectionNode.__proto__.constructor === restQuery.CollectionNode )	// jshint ignore:line
	{
		doormen( CollectionNode.schema , schema ) ;
	}
	
	schema.properties.slugId = { type: 'restQuery.slug' , sanitize: 'restQuery.randomSlug' } ;
	
	// force the creation of the 'parent' property
	schema.properties.parent = {
		type: 'strictObject' ,
		tier: 1 ,
		default: { id: '/', collection: null } ,
		properties: {
			id: { default: '/', type: 'objectId' } ,
			collection: { default: null, type: 'string' }
		}
	} ;
	
	// force the creation of the '*Access' property
	schema.properties.userAccess = {
		type: 'strictObject' ,
		tier: 3 ,
		default: {} ,
		keys: { type: 'objectId' } ,
		of: { type: 'restQuery.accessLevel' }
	} ;
	
	schema.properties.groupAccess = {
		type: 'strictObject' ,
		tier: 3 ,
		default: {} ,
		keys: { type: 'objectId' } ,
		of: { type: 'restQuery.accessLevel' }
	} ;
	
	schema.properties.otherAccess = {
		type: 'restQuery.accessLevel' ,
		tier: 3 ,
		default: schema.defaultAccessLevel
	} ;
	
	schema.properties.inheritAccess = { type: 'restQuery.inheritAccess' , default: schema.defaultInheritAccess } ;
	
	schema.indexes.push( { properties: { slugId: 1 , "parent.id": 1 } , unique: true } ) ; //, driver: { sparse: true } } ) ;
	
	
	// Call the parent constructor
	restQuery.Node.create( app , collectionNode ) ;
	
	// First check the child name
	//restQueryName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	restQueryName = name[ 0 ].toLowerCase() + name.slice( 1 ) ;
	
	// Create the ODM collection
	try {
		collection = app.world.createCollection( name , schema ) ;
	}
	catch ( error ) {
		// Create collection can throw if it constains Attachment that point to some inaccessible place
		log.fatal( error ) ;
		async.exit( 1 ) ;
		return ;
	}
	
	Object.defineProperties( collectionNode , {
		name: { value: restQueryName , enumerable: true } ,
		collection: { value: collection , enumerable: true } ,
		methods: { value: {} , enumerable: true } ,
		validate: { value: collection.validate } ,
		slugGenerationProperty: { value: schema.slugGenerationProperty , enumerable: true } ,
		slugGenerationOptions: { value: schema.slugGenerationOptions , enumerable: true } ,
		autoCollection: { value: schema.autoCollection , enumerable: true } ,
		
		beforeCreateHook: { value: schema.hooks.beforeCreate , enumerable: true } ,
		beforeModifyHook: { value: schema.hooks.beforeModify , enumerable: true } ,
		beforeDeleteHook: { value: schema.hooks.beforeDelete , enumerable: true }
	} ) ;
	
	// Add the collection to the app
	app.collectionNodes[ name ] = collectionNode ;
	
	return collectionNode ;
} ;



CollectionNode.prototype.initDocument = function initDocument( incomingDocument )
{
	if ( ! incomingDocument.slugId && this.slugGenerationProperty &&
		typeof incomingDocument[ this.slugGenerationProperty ] === 'string' &&
		incomingDocument[ this.slugGenerationProperty ].length >= 1 )
	{
		incomingDocument.slugId = restQuery.slugify( incomingDocument[ this.slugGenerationProperty ] , this.slugGenerationOptions ) ;
	}
} ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function createObjectNode( object , objectNode )
{
	return restQuery.ObjectNode.create( this.app , this , object , objectNode ) ;
} ;



CollectionNode.prototype._get = function _collectionNodeGet( pathParts , context , callback )
{
	var self = this , fingerprint , dbGetOptions = {} ;
	
	if ( pathParts.length === 0 )
	{
		if ( context.query.populate )
		{
			dbGetOptions.populate = this.checkPopulate( context.query.populate ) ;
			dbGetOptions.noReference = true ;
		}
		
		self.collection.collect( { "parent.id": context.parentNode.id } , dbGetOptions , function( error , batch ) {
			
			var filteredBatch = [] ;
			
			if ( error ) { callback( error ) ; return ; }
			
			async.foreach( batch , function( element , callback ) {
				
				restQuery.Node.checkAccess( {
						access: 'read' ,
						object: element ,
						ancestorObjectNodes: context.ancestorObjectNodes ,
						performer: context.performer
					} ,
					function( error ) {
						
						if ( ! error ) { filteredBatch.push( element ) ; }
						callback() ;
				} ) ;
			} )
			.exec( function( error ) {
				callback( undefined , filteredBatch , {} ) ;
			} ) ;
		} ) ;
		
		return ;
	}
	
	
	if ( pathParts.length === 1 && context.query.populate )
	{
		dbGetOptions.populate = this.checkPopulate( context.query.populate ) ;
		dbGetOptions.noReference = true ;
	}
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			fingerprint = { $id: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , dbGetOptions , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// we instanciate an objectNode to query
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode._get(
			pathParts.slice( 1 ) ,
			{
				performer: context.performer ,
				query: context.query ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype._post = function _collectionNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , fingerprint ;
	
	if ( pathParts.length === 0 )
	{
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
		{
			callback( ErrorStatus.badRequest( { message: "The body of a POST request, posting on a collection, should be a strict Object." } ) ) ;
			return ;
		}
		
		restQuery.Node.checkAccess( {
				access: 'readCreate' ,
				object: context.parentNode.object ,
				ancestorObjectNodes: context.ancestorObjectNodes ,
				performer: context.performer
			} ,
			function( error ) {
				if ( error ) { callback( error ) ; return ; }
				self.postDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			}
		) ;
		
		return ;
	}
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			fingerprint = { $id: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'method' :
			if ( ! this.methods[ pathParts[ 0 ].identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Method '" + pathParts[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.methods[ pathParts[ 0 ].identifier ]( pathParts , incomingDocument , context , callback ) ;
			return ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode._post(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				performer: context.performer ,
				query: context.query ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype.postDocument = function postDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , id , hookContext ;
	
	if ( ! context.beforeCreateDone )
	{
		incomingDocument.parent = {
			collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
			id: context.parentNode.id
		} ;
		
		incomingDocument.$id = self.collection.createId( incomingDocument ) ;
		
		if ( this.beforeCreateHook )
		{
			hookContext = {
				method: 'post' ,
				incomingDocument: incomingDocument ,
				pathParts: pathParts ,
				attachmentStreams: attachmentStreams ,
				performer: context.performer ,
				query: context.query ,
				app: self.app ,
				collectionNode: self ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ;
			
			this.beforeCreateHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				self.postDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			
			return ;
		}
	}
	
	try {
		this.initDocument( incomingDocument ) ;
		id = incomingDocument.$id ;
		self.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( self.transformError( error ) ) ;
		return ;
	}
	
	// Save eventual attachment streams as well
	incomingDocument.$.save( { attachmentStreams: attachmentStreams } , function( error ) {
		if ( error ) { callback( self.transformError( error ) ) ; return ; }
		callback( undefined , { id: id } , { status: 201 , name: id } ) ;
	} ) ;
} ;



CollectionNode.prototype._put = function _collectionNodePut( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PUT on a collection node' } ) ) ;
		return ;
	}
	
	
	
	var put = function put( error , document ) {
		
		if ( error )
		{
			if ( error.type === 'notFound' && pathParts.length === 1 )
			{
				// This is a normal case: the target does not exist yet,
				// and should be created by the request
				
				if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
				{
					callback( ErrorStatus.badRequest( { message: "The body of a PUT request, creating a new document, should be a strict Object." } ) ) ;
					return ;
				}
				
				restQuery.Node.checkAccess( {
						access: 'readCreate' ,
						object: context.parentNode.object ,
						ancestorObjectNodes: context.ancestorObjectNodes ,
						performer: context.performer
					} ,
					function( error ) {
						
						if ( error ) { callback( error ) ; return ; }
						
						self.putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					}
				) ;
			}
			else
			{
				// Here this is really an error
				callback( error ) ;
			}
			
			return ;
		}
		
		if ( document.parent.id.toString() !== context.parentNode.id.toString() )
		{
			callback( ErrorStatus.badRequest( { message: 'Ambigous PUT request: this ID exists but is the child of another parent.' } ) ) ;
			return ;
		}
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode._put(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				performer: context.performer ,
				query: context.query ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ;
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			context.slugMode = false ;
			this.collection.get( pathParts[ 0 ].identifier , put ) ;
			return ;
		
		case 'slugId' :
			context.slugMode = true ;
			this.collection.getUnique( { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } , put ) ;
			return ;
			
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
} ;



CollectionNode.prototype.putNewDocument = function putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{	
	var self = this , id , hookContext ;
	
	if ( ! context.beforeCreateDone )
	{
		incomingDocument.parent = {
			collection: context.parentNode.collectionNode && context.parentNode.collectionNode.name ,
			id: context.parentNode.id
		} ;
		
		if ( context.slugMode )
		{
			incomingDocument.$id = self.collection.createId( incomingDocument ) ;
			incomingDocument.slugId = pathParts[ 0 ].identifier ;
		}
		else
		{
			incomingDocument.$id = pathParts[ 0 ].identifier ;
		}
		
		if ( this.beforeCreateHook )
		{
			hookContext = {
				method: 'put' ,
				incomingDocument: incomingDocument ,
				pathParts: pathParts ,
				attachmentStreams: attachmentStreams ,
				performer: context.performer ,
				query: context.query ,
				app: self.app ,
				collectionNode: self ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ;
			
			this.beforeCreateHook( hookContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				self.putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			
			return ;
		}
	}
	
	
	try {
		this.initDocument( incomingDocument ) ;
		id = incomingDocument.$id ;
		self.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( self.transformError( error ) ) ;
		return ;
	}
	
	// overwrite:true for race conditions?
	incomingDocument.$.save( { overwrite: true , attachmentStreams: attachmentStreams } , function( error ) {
		if ( error ) { callback( self.transformError( error ) ) ; return ; }
		callback( undefined , { id: id } , { status: 201 } ) ;
	} ) ;
} ;



CollectionNode.prototype._patch = function _collectionNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , fingerprint ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on a collection node' } ) ) ;
		return ;
	}
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			fingerprint = { $id: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode._patch(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				performer: context.performer ,
				query: context.query ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype._delete = function _collectionNodeDelete( pathParts , context , callback )
{
	var self = this , fingerprint ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a DELETE on a collection node' } ) ) ;
		return ;
	}
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			fingerprint = { $id: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
			
		case 'slugId' :
			fingerprint = { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentNode.id } ;
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( fingerprint , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, delete or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document ) ;
		
		objectNode._delete(
			pathParts.slice( 1 ) ,
			{
				performer: context.performer ,
				query: context.query ,
				parentNode: context.parentNode ,
				ancestorObjectNodes: context.ancestorObjectNodes
			} ,
			callback
		) ;
	} ) ;
	
} ;


