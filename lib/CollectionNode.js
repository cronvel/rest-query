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

"use strict" ;



// Load modules
var ErrorStatus = require( 'error-status' ) ;
var doormen = require( 'doormen' ) ;
var async = require( 'async-kit' ) ;
var tree = require( 'tree-kit' ) ;

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

// Schema of schema
CollectionNode.schemaSchema = {
	type: 'strictObject' ,
	extraProperties: true ,
	properties: {
		properties: {
			type: 'strictObject' ,
			default: {}
		} ,
		defaultPublicAccess: tree.extend( { deep: true } , {} , restQuery.accessSchema , { optional: true } ) ,
		collectionMethods: {
			type: 'strictObject' ,
			of: { type: 'function' } ,
			default: {}
		} ,
		objectMethods: {
			type: 'strictObject' ,
			of: { type: 'function' } ,
			default: {}
		} ,
		slugGenerationProperty: { type: 'string' , default: null } ,
		slugGenerationOptions: { type: 'strictObject' , default: {} } ,
		autoCollection: { type: 'string' , default: null } ,
		hooks: {
			type: 'strictObject' ,
			default: {} ,
			extraProperties: true ,
			properties: {
				beforeCreate: restQueryHookSchema ,
				afterCreate: restQueryHookSchema ,
				beforeModify: restQueryHookSchema ,
				afterModify: restQueryHookSchema ,
				beforeDelete: restQueryHookSchema ,
				afterDelete: restQueryHookSchema
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
		doormen( CollectionNode.schemaSchema , schema ) ;
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
		tier: 4 ,
		default: {} ,
		keys: { type: 'objectId' } ,
		of: restQuery.accessSchema
	} ;
	
	schema.properties.groupAccess = {
		type: 'strictObject' ,
		tier: 4 ,
		default: {} ,
		keys: { type: 'objectId' } ,
		of: restQuery.accessSchema
	} ;
	
	// Public access should be extended using the schema.defaultPublicAccess
	schema.properties.publicAccess = tree.extend( { deep: true } , {} , restQuery.accessSchema ) ;
	schema.properties.publicAccess.default = schema.defaultPublicAccess ;
	
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
		collectionMethods: { value: schema.collectionMethods , enumerable: true } ,
		objectMethods: { value: schema.objectMethods , enumerable: true } ,
		validate: { value: collection.validate } ,
		slugGenerationProperty: { value: schema.slugGenerationProperty , enumerable: true } ,
		slugGenerationOptions: { value: schema.slugGenerationOptions , enumerable: true } ,
		autoCollection: { value: schema.autoCollection , enumerable: true } ,
		
		beforeCreateHook: { value: schema.hooks.beforeCreate.bind( app ) , enumerable: true } ,
		afterCreateHook: { value: schema.hooks.afterCreate.bind( app ) , enumerable: true } ,
		beforeModifyHook: { value: schema.hooks.beforeModify.bind( app ) , enumerable: true } ,
		afterModifyHook: { value: schema.hooks.afterModify.bind( app ) , enumerable: true } ,
		beforeDeleteHook: { value: schema.hooks.beforeDelete.bind( app ) , enumerable: true } ,
		afterDeleteHook: { value: schema.hooks.afterDelete.bind( app ) , enumerable: true }
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
CollectionNode.prototype.createObjectNode = function createObjectNode( object , ancestors , objectNode )
{
	return restQuery.ObjectNode.create( this.app , this , object , ancestors , objectNode ) ;
} ;



CollectionNode.prototype._get = function _collectionNodeGet( pathParts , context , callback )
{
	var self = this , query , dbGetOptions = {} ;
	
	if ( pathParts.length === 0 )
	{
		if ( context.input.query.populate )
		{
			dbGetOptions.populate = this.checkPopulate( context.input.query.populate ) ;
			context.output.serializer = restQuery.serializers.toJsonDocumentDepth ;
			context.output.serializerArg = 2 ;
			//dbGetOptions.noReference = true ;
		}
		
		if ( context.batchOf )
		{
			query = { _id: { $in: context.batchOf } } ;
		}
		else
		{
			query = { "parent.id": context.parentObjectNode.id } ;
		}
		
		self.collection.find( query , dbGetOptions , function( error , batch ) {
			if ( error ) { callback( error ) ; return ; }
			self.getBatch( batch , context , callback ) ;
		} ) ;
		
		return ;
	}
	
	
	if ( pathParts.length === 1 && context.input.query.populate )
	{
		dbGetOptions.populate = this.checkPopulate( context.input.query.populate ) ;
		context.output.serializer = restQuery.serializers.toJsonDocumentDepth ;
		context.output.serializerArg = 2 ;
		//dbGetOptions.noReference = true ;
	}
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else
			{
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}
			
			break ;
			
		case 'slugId' :
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( { message: "SlugId are not supported after a multi-link." } ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , dbGetOptions , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// we instanciate an objectNode to query
		var objectNode = self.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		objectNode._get(
			pathParts.slice( 1 ) ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				linker: context.linker ,
				linkerPath: context.linkerPath ,
				batchOf: context.batchOf
			} ,
			callback
		) ;
	} ) ;
} ;



// Callback after the batch query is performed, and about to be sent to the client
CollectionNode.prototype.getBatch = function getBatch( batch , context , callback )
{	
	var self = this , element , filteredBatch = [] ;
	
	async.foreach( batch , function( element , foreachCallback ) {
		
		restQuery.Node.checkAccess( context.input.performer , 'read' , 1 , element , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ,
			function( error ) {
				
				if ( ! error ) { filteredBatch.push( element ) ; }
				foreachCallback() ;
			} 
		) ;
	} )
	.exec( function( error ) {
		callback( undefined , filteredBatch , {
			input: context.input ,
			output: context.output ,
			
			// /!\ should filteredBatch be transformed to a regular Roots-DB Batch? /!\
			batch: filteredBatch ,
			collectionNode: self ,
			parentObjectNode: context.parentObjectNode
		} ) ;
	} ) ;
} ;



CollectionNode.prototype._post = function _collectionNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , query ;
	
	if ( pathParts.length === 0 )
	{
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
		{
			callback( ErrorStatus.badRequest( { message: "The body of a POST request, posting on a collection, should be a strict Object." } ) ) ;
			return ;
		}
		
		restQuery.Node.checkAccess( context.input.performer , 'create' , 1 , context.parentObjectNode.object , context.parentObjectNode.ancestors ,
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
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else
			{
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}
			
			break ;
			
		case 'slugId' :
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( { message: "SlugId are not supported after a multi-link." } ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		case 'method' :
			if ( ! this.collectionMethods[ pathParts[ 0 ].identifier ] )
			{
				callback( ErrorStatus.notFound( { message: "Method '" + pathParts[ 0 ] + "' not found." } ) ) ;
				return ;
			}
			
			this.collectionMethods[ pathParts[ 0 ].identifier ].call( this , pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			return ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		objectNode._post(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				linker: context.linker ,
				linkerPath: context.linkerPath ,
				batchOf: context.batchOf
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype.postDocument = function postDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , id , beforeContext , afterContext , newObjectNode ;
	
	
	if ( ! context.beforeCreateDone )
	{
		if ( context.batchOf )
		{
			incomingDocument.parent = {
				collection: null ,
				id: '/'
			} ;
		}
		else
		{
			incomingDocument.parent = {
				collection: context.parentObjectNode.collectionNode && context.parentObjectNode.collectionNode.name ,
				id: context.parentObjectNode.id
			} ;
		}
		
		// /!\ Don't like that $id thing now, but beware: zenparc use it in its users.hooks.js file
		incomingDocument.$id = self.collection.createId( incomingDocument ) ;
		
		if ( this.beforeCreateHook )
		{
			beforeContext = {
				input: context.input ,
				output: context.output ,
				//method: 'post' ,
				incomingDocument: incomingDocument ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self ,
				parentObjectNode: context.parentObjectNode
			} ;
			
			this.beforeCreateHook( beforeContext , function( error ) {
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
		
		var newObjectNode = self.createObjectNode( incomingDocument , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		context.output.httpStatus = 201 ;
		
		afterContext = {
			input: context.input ,
			output: context.output ,
			document: incomingDocument ,
			collectionNode: self ,
			objectNode: newObjectNode
		} ;
		
		var hook = function() {
			
			if ( ! self.afterCreateHook )
			{
				callback( undefined , { id: id } , afterContext ) ;
				return ;
			}
			
			self.afterCreateHook( afterContext , function( error ) {
				// Send 201 anyway?
				if ( error ) { callback( error , { id: id } , afterContext ) ; return ; }
				callback( undefined , { id: id } , afterContext ) ;
			} ) ;
		} ;
		
		
		if ( context.batchOf )
		{
			// batchOf is a ref to the actual array of link
			context.batchOf.push( id ) ;
			context.linker.object.$.stage( context.linkerPath ) ;
			
			afterContext.batchOf = context.batchOf ;
			afterContext.linker = context.linker ;
			
			context.linker.object.$.commit( function( error ) {
				
				// Send 201 anyway?
				if ( error ) { callback( error , { id: id } , afterContext ) ; return ; }
				
				hook() ;
			} ) ;
		}
		else
		{
			hook() ;
		}
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
				
				restQuery.Node.checkAccess( context.input.performer , 'create' , 1 , context.parentObjectNode.object , context.parentObjectNode.ancestors ,
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
		
		if ( document.parent.id.toString() !== context.parentObjectNode.id.toString() )
		{
			callback( ErrorStatus.badRequest( { message: 'Ambigous PUT request: this ID exists but is the child of another parent.' } ) ) ;
			return ;
		}
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		objectNode._put(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				linker: context.linker ,
				linkerPath: context.linkerPath ,
				batchOf: context.batchOf
			} ,
			callback
		) ;
	} ;
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( context.batchOf && ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
			{
				callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
				return ;
			}
			
			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			context.slugMode = false ;
			this.collection.get( pathParts[ 0 ].identifier , put ) ;
			
			return ;
		
		case 'slugId' :
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( { message: "SlugId are not supported after a multi-link." } ) ) ;
				return ;
			}
			
			context.slugMode = true ;
			this.collection.getUnique( { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentObjectNode.id } , put ) ;
			return ;
			
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
} ;



CollectionNode.prototype.putNewDocument = function putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{	
	var self = this , id , beforeContext , afterContext ;
	
	if ( ! context.beforeCreateDone )
	{
		incomingDocument.parent = {
			collection: context.parentObjectNode.collectionNode && context.parentObjectNode.collectionNode.name ,
			id: context.parentObjectNode.id
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
			beforeContext = {
				input: context.input ,
				output: context.output ,
				//method: 'put' ,
				incomingDocument: incomingDocument ,
				//pathParts: pathParts ,
				//attachmentStreams: attachmentStreams ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				//app: self.app ,
				collectionNode: self ,
				parentObjectNode: context.parentObjectNode
			} ;
			
			this.beforeCreateHook( beforeContext , function( error ) {
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
		
		var newObjectNode = self.createObjectNode( incomingDocument , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		context.output.httpStatus = 201 ;
		
		afterContext = {
			input: context.input ,
			output: context.output ,
			document: incomingDocument ,
			collectionNode: self ,
			objectNode: newObjectNode
		} ;
		
		if ( ! self.afterCreateHook )
		{
			callback( undefined , { id: id } , afterContext ) ;
			return ;
		}
		
		self.afterCreateHook( afterContext , function( error ) {
			// Send 201 anyway?
			if ( error ) { callback( error , { id: id } , afterContext ) ; return ; }
			callback( undefined , { id: id } , afterContext ) ;
		} ) ;
	} ) ;
} ;



CollectionNode.prototype._patch = function _collectionNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var self = this , query ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a PATCH on a collection node' } ) ) ;
		return ;
	}
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else
			{
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}
			
			break ;
			
		case 'slugId' :
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( { message: "SlugId are not supported after a multi-link." } ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		objectNode._patch(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				linker: context.linker ,
				linkerPath: context.linkerPath ,
				batchOf: context.batchOf
			} ,
			callback
		) ;
	} ) ;
} ;



CollectionNode.prototype._delete = function _collectionNodeDelete( pathParts , context , callback )
{
	var self = this , query ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( { message: 'Cannot perform a DELETE on a collection node' } ) ) ;
		return ;
	}
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].identifier + "' not found." } ) ) ;
					return ;
				}
				
				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else
			{
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}
			
			break ;
			
		case 'slugId' :
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( { message: "SlugId are not supported after a multi-link." } ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( { message: "'" + pathParts[ 0 ].type + "' not found." } ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , function( error , document ) {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, delete or access should be done by the underlying ObjectNode
		var objectNode = self.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ) ;
		
		objectNode._delete(
			pathParts.slice( 1 ) ,
			{
				intput: context.input ,
				output: context.output ,
				//performer: context.input.performer ,
				//query: context.input.query ,
				linker: context.linker ,
				linkerPath: context.linkerPath ,
				batchOf: context.batchOf
			} ,
			callback
		) ;
	} ) ;
	
} ;


