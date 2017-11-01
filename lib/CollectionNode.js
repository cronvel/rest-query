/*
	Rest Query
	
	Copyright (c) 2014 - 2016 Cédric Ronvel
	
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
var Promise = require( 'seventh' ) ;

var tree = require( 'tree-kit' ) ;

var restQuery = require( './restQuery.js' ) ;
var rootsDb = require( 'roots-db' ) ;

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
		extraProperties: {
			type: 'boolean' ,
			default: false
		} ,
		properties: {
			type: 'strictObject' ,
			default: {}
		} ,
		indexes: {
			type: 'array' ,
			default: []
		} ,
		defaultPublicAccess: tree.extend( { deep: true } , {} , restQuery.accessSchema , { optional: true } ) ,
		restrictAccess: tree.extend( { deep: true } , {} , restQuery.accessSchema , { default: null } ) ,
		alterSchemaProperty: {
			optional: 'true' ,
			type: 'string'
		} ,
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
	
	// Add the name of the collection to the schema
	schema.collectionName = name ;
	
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
	
	CollectionNode.ensureIndex( schema.indexes , { properties: { slugId: 1 , "parent.id": 1 } , unique: true } ) ;
	
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
		schema: { value: schema , enumerable: true } ,
		collectionMethods: { value: schema.collectionMethods , enumerable: true } ,
		objectMethods: { value: schema.objectMethods , enumerable: true } ,
		validate: { value: collection.validate } ,
		alterSchemaProperty: { value: schema.alterSchemaProperty } ,
		slugGenerationProperty: { value: schema.slugGenerationProperty , enumerable: true } ,
		slugGenerationOptions: { value: schema.slugGenerationOptions , enumerable: true } ,
		autoCollection: { value: schema.autoCollection , enumerable: true } ,
		restrictAccess: { value: schema.restrictAccess , enumerable: true } ,		// Maximal access allowed for users
		
		beforeCreateHook: { value: schema.hooks.beforeCreate && schema.hooks.beforeCreate.bind( app ) , enumerable: true } ,
		afterCreateHook: { value: schema.hooks.afterCreate && schema.hooks.afterCreate.bind( app ) , enumerable: true } ,
		beforeModifyHook: { value: schema.hooks.beforeModify && schema.hooks.beforeModify.bind( app ) , enumerable: true } ,
		afterModifyHook: { value: schema.hooks.afterModify && schema.hooks.afterModify.bind( app ) , enumerable: true } ,
		beforeDeleteHook: { value: schema.hooks.beforeDelete && schema.hooks.beforeDelete.bind( app ) , enumerable: true } ,
		afterDeleteHook: { value: schema.hooks.afterDelete && schema.hooks.afterDelete.bind( app ) , enumerable: true }
	} ) ;
	
	// Add the collection to the app
	app.collectionNodes[ name ] = collectionNode ;
	
	// Add methods
	collectionNode.objectMethods.schema =
		collectionNode.collectionMethods.schema = CollectionNode.prototype.schemaMethod.bind( collectionNode ) ;
	
	return collectionNode ;
} ;



CollectionNode.ensureIndex = rootsDb.Collection.ensureIndex ;



// Executed at document creation (PUT, POST)
CollectionNode.prototype.initDocument = function initDocument( incomingDocument )
{
	if ( ! incomingDocument.slugId && this.slugGenerationProperty &&
		typeof incomingDocument[ this.slugGenerationProperty ] === 'string' &&
		incomingDocument[ this.slugGenerationProperty ].length >= 1 )
	{
		incomingDocument.slugId = restQuery.slugify( incomingDocument[ this.slugGenerationProperty ] , this.slugGenerationOptions ) ;
	}
} ;



// Executed at document modification (PATCH)
CollectionNode.prototype.initPatch = function initPatch( incomingPatch ) {} ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function createObjectNode( object , ancestors , alter , objectNode )
{
	return restQuery.ObjectNode.create( this.app , this , object , ancestors , alter , objectNode ) ;
} ;



// A wrapper for custom methods
CollectionNode.prototype.userMethodWrapper = function userMethodWrapper( methodName , pathParts , incomingDocument , attachmentStreams , context , callback )
{
	if ( ! this.collectionMethods[ methodName ] )
	{
		callback( ErrorStatus.notFound( "Method '" + methodName + "' not found." ) ) ;
		return ;
	}
	
	// Reset output serializer, if any
	context.output.serializer = null ;
	context.output.serializerOpt1 = null ;
	context.output.serializerOpt2 = null ;
	
	// /!\ TMP!!!
	Promise.try(
		() => this.collectionMethods[ methodName ].call( this , pathParts , incomingDocument , attachmentStreams , context )
	).done(
		response => {
			
			if ( ! response || typeof response !== 'object' ) { response = {} ; }
			
			// There is no response context with promises!
			var responseContext = {} ;
			//if ( ! responseContext || typeof responseContext !== 'object' ) { responseContext = {} ; }
			
			responseContext.input = context.input ;
			responseContext.output = context.output ;
			responseContext.alter = context.alter ;
			responseContext.collectionNode = this ;
			responseContext.parentObjectNode = context.parentObjectNode ;
			
			callback( undefined , response , responseContext ) ;
		} ,
		error => {
			callback( error ) ;
		}
	) ;
	
	/*
	this.collectionMethods[ methodName ].call( this , pathParts , incomingDocument , attachmentStreams , context ,
		
		( error , response , responseContext ) => {
			
			if ( error ) { callback( error ) ; return ; }
			
			if ( ! response || typeof response !== 'object' ) { response = {} ; }
			if ( ! responseContext || typeof responseContext !== 'object' ) { responseContext = {} ; }
			
			responseContext.input = context.input ;
			responseContext.output = context.output ;
			responseContext.alter = context.alter ;
			responseContext.collectionNode = this ;
			responseContext.parentObjectNode = context.parentObjectNode ;
			
			callback( error , response , responseContext ) ;
		}
	) ;
	*/
} ;



// Compute the mask for populated queries
CollectionNode.prototype.populatePropertyMask = function populatePropertyMask( populate , tier , pTier )
{
	var i , iMax , schema , foreignCollection ;
	
	var mask = tree.clone( this.collection.tierPropertyMasks[ tier ] ) ;
	
	for ( i = 0 , iMax = populate.length ; i < iMax ; i ++ )
	{
		//console.log( this.collection.documentSchema ) ;
		try {
			schema = doormen.path( this.collection.documentSchema , populate[ i ] ) ;
		}
		catch ( error ) {
			//console.log( error ) ;
			continue ;
		}
		
		//console.log( "foreign schema:" , schema ) ;
		
		// /!\ this is because populate are not checked ATM, see Node.prototype.checkPopulate()
		if ( ! schema ) { continue ; }
		
		if ( schema.type === 'link' || schema.type === 'multiLink' || schema.type === 'backLink' )
		{
			foreignCollection = this.app.world.collections[ schema.collection ] ;
			if ( ! foreignCollection ) { continue ; }
			//console.log( "foreign mask:" , foreignCollection.tierPropertyMasks[ pTier ] ) ;
			tree.path.set( mask , populate[ i ] , foreignCollection.tierPropertyMasks[ pTier ] || true ) ;
		}
	}
	
	//console.log( "populate mask: " , mask ) ;
	return mask ;
} ;



// Check restricted access on that collection.
// Only used by GET on a collection for instance, just to speed up things (since Node.checkAccess() check that nonetheless).
// Also all use case may benefit that later.
CollectionNode.prototype.restrictedAccess = function restrictedAccess( pathParts , context , accessType , accessLevel )
{
	if ( context.batchOf || ! this.restrictAccess || context.input.performer.system )
	{
		return false ;
	}
	
	var i , iMax ;
	
	for ( i = 1 , iMax = pathParts.length ; i < iMax ; i ++ )
	{
		switch ( pathParts[ i ].type )
		{
			case 'collection' :
			case 'id' :
			case 'slugId' :
				// If there is just one more collection node to go, then this is a traverse
				return ( this.restrictAccess.traverse || 0 ) < accessLevel ;
		}
	}
	
	if ( accessType === null ) { return false ; }
	
	return ( this.restrictAccess[ accessType ] || 0 ) < accessLevel ;
} ;



CollectionNode.prototype._get = function _collectionNodeGet( pathParts , context , callback )
{
	var query , dbGetOptions = {} ;
	
	if ( pathParts.length === 0 )
	{
		if ( this.restrictedAccess( pathParts , context , 'read' , 1 ) )
		{
			callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
			return ;
		}
		
		if ( context.input.query.populate )
		{
			dbGetOptions.populate = context.input.query.populate = this.checkPopulate( context.input.query.populate ) ;
			context.output.serializer = restQuery.serializers.toJsonMaskAndDocumentDepth ;
			context.output.serializerOpt1 = this.populatePropertyMask( context.input.query.populate , context.input.tier , context.input.pTier ) ;
			context.output.serializerOpt2 = 2 ;
		}
		else
		{
			context.output.serializer = restQuery.serializers.toJsonMask ;
			context.output.serializerOpt1 = this.collection.tierPropertyMasks[ context.input.tier ] ;
		}
		
		if ( context.batchOf )
		{
			query = { _id: { $in: context.batchOf } } ;
		}
		else
		{
			query = { "parent.id": context.parentObjectNode.id } ;
		}
		
		this.collection.find( query , dbGetOptions , ( error , batch ) => {
			if ( error ) { callback( error ) ; return ; }
			this.getBatch( batch , context , callback ) ;
		} ) ;
		
		return ;
	}
	
	if ( pathParts.length === 1 )
	{
		if ( context.input.query.populate )
		{
			dbGetOptions.populate = context.input.query.populate = this.checkPopulate( context.input.query.populate ) ;
			context.output.serializer = restQuery.serializers.toJsonMaskAndDocumentDepth ;
			context.output.serializerOpt1 = this.populatePropertyMask( context.input.query.populate , context.input.tier , context.input.pTier ) ;
			context.output.serializerOpt2 = 2 ;
			//dbGetOptions.noReference = true ;
		}
		else
		{
			context.output.serializer = restQuery.serializers.toJsonMask ;
			context.output.serializerOpt1 = this.collection.tierPropertyMasks[ context.input.tier ] ;
		}
	}
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'read' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ) ;
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
			if ( this.restrictedAccess( pathParts , context , 'read' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		case 'method' :
			if ( this.restrictedAccess( pathParts , context , 'traverse' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			this.userMethodWrapper( pathParts[ 0 ].identifier , pathParts , null , null , context , callback ) ;
			return ;
		
		default:
			callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , dbGetOptions , ( error , document ) => {
		
		if ( error ) { callback( error ) ; return ; }
		
		// we instanciate an objectNode to query
		var objectNode = this.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter ) ;
		
		objectNode._get(
			pathParts.slice( 1 ) ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
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
	var element , filteredBatch = [] ;
	
	async.foreach( batch , ( element , foreachCallback ) => {
		
		//restQuery.Node.checkAccess( context.input.performer , 'read' , 1 , this , element , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ,
		this.checkReadAccess( context , element , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) ,
			error => {
				
				if ( ! error ) { filteredBatch.push( element ) ; }
				foreachCallback() ;
			} 
		) ;
	} )
	.exec( error => {
		callback( undefined , filteredBatch , {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			
			// /!\ should filteredBatch be transformed to a regular Roots-DB Batch? /!\
			batch: filteredBatch ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ) ;
	} ) ;
} ;



CollectionNode.prototype._post = function _collectionNodePost( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var query ;
	
	if ( pathParts.length === 0 )
	{
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
		{
			callback( ErrorStatus.badRequest( "The body of a POST request, posting on a collection, should be a strict Object." ) ) ;
			return ;
		}
		
		if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) )
		{
			callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
			return ;
		}
		
		//restQuery.Node.checkAccess( context.input.performer , 'create' , 1 , context.parentObjectNode.collectionNode , context.parentObjectNode.object , context.parentObjectNode.ancestors ,
		this.checkCreateAccess( context , error => {
			if ( error ) { callback( error ) ; return ; }
			this.postDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
		} ) ;
		
		return ;
	}
	
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ) ;
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
			if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		case 'method' :
			if ( this.restrictedAccess( pathParts , context , 'traverse' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			this.userMethodWrapper( pathParts[ 0 ].identifier , pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			return ;
		
		default:
			callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , ( error , document ) => {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = this.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter ) ;
		
		objectNode._post(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
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
	var id , beforeContext , afterContext ;
	
	
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
		
		// /!\ Don't like that $id thing now, but beware: zenparc uses it in its users.hooks.js file
		incomingDocument.$id = this.collection.createId( incomingDocument ) ;
		
		if ( this.beforeCreateHook )
		{
			beforeContext = {
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				incomingDocument: incomingDocument ,
				collectionNode: this ,
				parentObjectNode: context.parentObjectNode
			} ;
			
			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.beforeCreateHook( beforeContext ) )
			.done(
				() => {
					context.beforeCreateDone = true ;
					this.postDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
				} ,
				error => { callback( error ) ; }
			) ;
			
			/*
			this.beforeCreateHook( beforeContext , error => {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				this.postDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			*/
			
			return ;
		}
	}
	
	try {
		this.initDocument( incomingDocument ) ;
		this.checkAlterSchema( incomingDocument , context ) ;
		id = incomingDocument.$id ;
		this.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( this.transformError( error ) ) ;
		return ;
	}
	
	// Save eventual attachment streams as well
	incomingDocument.$.save( { attachmentStreams: attachmentStreams } , error => {
		
		if ( error ) { callback( this.transformError( error ) ) ; return ; }
		
		context.output.httpStatus = 201 ;
		
		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			document: incomingDocument ,
			collectionNode: this ,
			objectNode: this.createObjectNode( incomingDocument , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter )
		} ;
		
		var hook = () => {
			
			if ( ! this.afterCreateHook )
			{
				callback( undefined , { id: id } , afterContext ) ;
				return ;
			}
			
			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.afterCreateHook( afterContext ) )
			.done(
				() => {
					callback( undefined , { id: id } , afterContext ) ;
				} ,
				error => {
					// Send 201 anyway?
					callback( error , { id: id } , afterContext ) ;
				}
			) ;
			
			/*
			this.afterCreateHook( afterContext , error => {
				// Send 201 anyway?
				if ( error ) { callback( error , { id: id } , afterContext ) ; return ; }
				callback( undefined , { id: id } , afterContext ) ;
			} ) ;
			*/
		} ;
		
		
		if ( context.batchOf )
		{
			// batchOf is a ref to the actual array of link
			context.batchOf.push( id ) ;
			context.linker.object.$.stage( context.linkerPath ) ;
			
			afterContext.batchOf = context.batchOf ;
			afterContext.linker = context.linker ;
			
			context.linker.object.$.commit( error => {
				
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
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( 'Cannot perform a PUT on a collection node' ) ) ;
		return ;
	}
	
	
	
	var put = ( error , document ) => {
		
		if ( error )
		{
			if ( error.type === 'notFound' && pathParts.length === 1 )
			{
				// This is a normal case: the target does not exist yet,
				// and should be created by the request
				
				if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) )
				{
					callback( ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ) ;
					return ;
				}
				
				if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) )
				{
					callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
					return ;
				}
				
				//restQuery.Node.checkAccess( context.input.performer , 'create' , 1 , context.parentObjectNode.collectionNode , context.parentObjectNode.object , context.parentObjectNode.ancestors ,
				this.checkCreateAccess( context , error => {
					if ( error ) { callback( error ) ; return ; }
					
					this.putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
				} ) ;
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
			callback( ErrorStatus.badRequest( 'Ambigous PUT request: this ID exists but is the child of another parent.' ) ) ;
			return ;
		}
		
		/*
			/!\ access 4 or 5?
			Or should a special access type 'replace' be created?
			Or double-check for 'delete' on this node and 'create' on the parent node?
			Well, 'write 4' looks ok: one should have a 'restricted' access to the ressource.
		*/
		if ( this.restrictedAccess( pathParts , context , 'write' , 4 ) )
		{
			callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
			return ;
		}
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = this.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter ) ;
		
		objectNode._put(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
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
			if ( this.restrictedAccess( pathParts , context , null , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf && ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
			{
				callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ) ;
				return ;
			}
			
			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			context.slugMode = false ;
			this.collection.get( pathParts[ 0 ].identifier , put ) ;
			
			return ;
		
		case 'slugId' :
			if ( this.restrictedAccess( pathParts , context , null , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ) ;
				return ;
			}
			
			context.slugMode = true ;
			this.collection.getUnique( { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentObjectNode.id } , put ) ;
			return ;
			
		default:
			callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
			return ;
	}
} ;



CollectionNode.prototype.putNewDocument = function putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback )
{	
	var id , beforeContext , afterContext ;
	
	if ( ! context.beforeCreateDone )
	{
		incomingDocument.parent = {
			collection: context.parentObjectNode.collectionNode && context.parentObjectNode.collectionNode.name ,
			id: context.parentObjectNode.id
		} ;
		
		if ( context.slugMode )
		{
			incomingDocument.$id = this.collection.createId( incomingDocument ) ;
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
				alter: context.alter ,
				incomingDocument: incomingDocument ,
				collectionNode: this ,
				parentObjectNode: context.parentObjectNode
			} ;
			
			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.beforeCreateHook( beforeContext ) )
			.done(
				() => {
					context.beforeCreateDone = true ;
					this.putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
				} ,
				error => { callback( error ) ; }
			) ;
			
			/*
			this.beforeCreateHook( beforeContext , error => {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				this.putNewDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			*/
			return ;
		}
	}
	
	try {
		this.initDocument( incomingDocument ) ;
		this.checkAlterSchema( incomingDocument , context ) ;
		id = incomingDocument.$id ;
		this.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( this.transformError( error ) ) ;
		return ;
	}
	
	// overwrite:true for race conditions?
	incomingDocument.$.save( { overwrite: true , attachmentStreams: attachmentStreams } , error => {
		
		if ( error ) { callback( this.transformError( error ) ) ; return ; }
		
		context.output.httpStatus = 201 ;
		
		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			document: incomingDocument ,
			collectionNode: this ,
			objectNode: this.createObjectNode( incomingDocument , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter )
		} ;
		
		if ( ! this.afterCreateHook )
		{
			callback( undefined , { id: id } , afterContext ) ;
			return ;
		}
		
		// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
		// will be patched later with async/await
		Promise.try( () => this.afterCreateHook( afterContext ) )
		.done(
			() => {
				callback( undefined , { id: id } , afterContext ) ;
			} ,
			error => {
				// Send 201 anyway?
				callback( error , { id: id } , afterContext ) ;
			}
		) ;
		
		/*
		this.afterCreateHook( afterContext , error => {
			// Send 201 anyway?
			if ( error ) { callback( error , { id: id } , afterContext ) ; return ; }
			callback( undefined , { id: id } , afterContext ) ;
		} ) ;
		*/
	} ) ;
} ;



CollectionNode.prototype._patch = function _collectionNodePatch( pathParts , incomingDocument , attachmentStreams , context , callback )
{
	var query ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( 'Cannot perform a PATCH on a collection node' ) ) ;
		return ;
	}
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'write' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ) ;
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
			if ( this.restrictedAccess( pathParts , context , 'write' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , ( error , document ) => {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, overwrite or access should be done by the underlying ObjectNode
		var objectNode = this.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter ) ;
		
		objectNode._patch(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
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
	var query ;
	
	if ( pathParts.length === 0 )
	{
		callback( ErrorStatus.badRequest( 'Cannot perform a DELETE on a collection node' ) ) ;
		return ;
	}
	
	
	switch ( pathParts[ 0 ].type )
	{
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'delete' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) )
				{
					callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ) ;
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
			if ( this.restrictedAccess( pathParts , context , 'delete' , 1 ) )
			{
				callback( ErrorStatus.forbidden( "Access forbidden." ) ) ;
				return ;
			}
			
			if ( context.batchOf )
			{
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				callback( ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ) ;
				return ;
			}
			
			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;
			
			break ;
		
		default:
			callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
			return ;
	}
	
	
	// Process the child object
	this.collection.getUnique( query , ( error , document ) => {
		
		if ( error ) { callback( error ) ; return ; }
		
		// The resource exists, delete or access should be done by the underlying ObjectNode
		var objectNode = this.createObjectNode( document , [ context.parentObjectNode ].concat( context.parentObjectNode.ancestors ) , context.alter ) ;
		
		objectNode._delete(
			pathParts.slice( 1 ) ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				linker: context.linker ,
				linkerPath: context.linkerPath ,
				batchOf: context.batchOf
			} ,
			callback
		) ;
	} ) ;
} ;



/*
	checkReadAccess( context , element , ancestors , callback )
*/
CollectionNode.prototype.checkReadAccess = function checkReadAccess( context , object , ancestors , callback )
{
	restQuery.Node.checkAccess(
		context.input.performer ,
		'read' ,
		context.input.tier ,
		this ,
		object ,
		ancestors ,
		callback
	) ;
} ;



/*
	checkCreateAccess( context , callback )
*/
CollectionNode.prototype.checkCreateAccess = function checkCreateAccess( context , callback )
{
	restQuery.Node.checkAccess(
		context.input.performer ,
		'create' ,
		1 ,
		context.parentObjectNode.collectionNode ,
		context.parentObjectNode.object ,
		context.parentObjectNode.ancestors ,
		callback
	) ;
} ;



CollectionNode.prototype.checkAlterSchema = function checkAlterSchema( document , context , isPatch )
{
	if ( context.alter && context.alter.schema && context.alter.schema[ this.name ] )
	{
		if ( isPatch ) { doormen.patch( context.alter.schema[ this.name ] , document ) ; }
		else { doormen( context.alter.schema[ this.name ] , document ) ; }
	}
} ;



CollectionNode.prototype.mergedSchema = function mergedSchema( context )
{
	var schema , alterSchema , options = { own: true } ;
	
	if ( context.alter && context.alter.schema && ( alterSchema = context.alter.schema[ this.name ] ) )
	{
		log.info( "Alter schema detected" ) ;
		schema = tree.extend( options , {} , this.schema ) ;
		schema.properties = tree.extend( options , {} , this.schema.properties , alterSchema.properties ) ;
		if ( 'extraProperties' in alterSchema ) { schema.extraProperties = alterSchema.extraProperties ; }
		return schema ;
	}
	else
	{
		return this.schema ;
	}
} ;





			/* Methods */



// Used with GET, retrieve the schema of the current collection
CollectionNode.prototype.schemaMethod = function schemaMethod( path , incomingDocument , attachmentStreams , context )
{
	if ( context.input.method !== 'get' )
	{
		return Promise.reject( ErrorStatus.badRequest( 'Methods not compatible' ) ) ;
	}
	
	context.output.serializer = restQuery.serializers.toJsonMask ;
	context.output.serializerOpt1 = {
		// Sure:
		templateData: true ,
		collectionName: true ,
		extraProperties: true ,
		properties: true ,
		
		// Maybe:
		path: true ,
		defaultPublicAccess: true ,
		restrictAccess: true ,
		autoCollection: true ,
		indexes: true ,
		restQueryType: true ,
	} ;
	
	return this.mergedSchema( context ) ;
} ;


