/*
	Rest Query

	Copyright (c) 2014 - 2019 Cédric Ronvel

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



const Promise = require( 'seventh' ) ;
const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const tree = require( 'tree-kit' ) ;
const rootsDb = require( 'roots-db' ) ;
const restQuery = require( './restQuery.js' ) ;
const hash = require( 'hash-kit' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* CollectionNode */



function CollectionNode( app , name , schema ) {
	var collection , restQueryName ;

	// Check if it's not called by derivatives
	var isVanilla = Object.getPrototypeOf( this ) === CollectionNode.prototype ;

	// Do not apply on derivative of CollectionNode, they should define their own defaults
	if ( isVanilla ) {
		schema = doormen( CollectionNode.schemaSchema , schema ) ;
	}

	// Add the name of the collection to the schema
	schema.collectionName = name ;

	schema.properties.slugId = {
		type: 'restQuery.slug' ,
		system: true ,
		tags: [ 'id' ] ,
		sanitize: 'restQuery.randomSlug'
	} ;

	// force the creation of the 'parent' property
	schema.properties.parent = {
		type: 'strictObject' ,
		system: true ,
		tags: [ 'id' ] ,
		noSubmasking: true ,
		default: { id: '/' , collection: 'root' } ,
		properties: {
			id: { default: '/' , type: 'objectId' } ,
			collection: { default: null , type: 'string' }
		}
	} ;

	// force the creation of the '*Access' property
	schema.properties.userAccess = {
		type: 'strictObject' ,
		system: true ,
		tags: [ 'access' ] ,
		default: {} ,
		keys: { type: 'objectId' } ,
		of: restQuery.accessSchema
	} ;

	schema.properties.groupAccess = {
		type: 'strictObject' ,
		system: true ,
		tags: [ 'access' ] ,
		default: {} ,
		keys: { type: 'objectId' } ,
		of: restQuery.accessSchema
	} ;

	// Public access should be extended using the schema.defaultPublicAccess
	schema.properties.publicAccess = tree.extend( { deep: true } , { system: true } , restQuery.accessSchema ) ;
	schema.properties.publicAccess.default = schema.defaultPublicAccess ;

	CollectionNode.ensureIndex( schema.indexes , { properties: { "parent.id": 1 } } ) ;
	CollectionNode.ensureIndex( schema.indexes , { properties: { slugId: 1 , "parent.id": 1 } , unique: true } ) ;

	// Call the parent constructor
	restQuery.Node.call( this , app ) ;

	// First check the child name
	//restQueryName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	restQueryName = name[ 0 ].toLowerCase() + name.slice( 1 ) ;

	// Create the ODM collection
	try {
		collection = app.world.createCollection( name , schema ) ;
	}
	catch ( error ) {
		// Create collection can throw if it constains Attachment that point to some inaccessible place
		log.fatal( "RestQuery CollectionNode failed when created RootsDB collection: %E" , error ) ;
		Promise.asyncExit( 1 ) ;
		return ;
	}

	this.name = restQueryName ;
	this.collection = collection ;
	this.schema = schema ;
	this.collectionMethods = schema.collectionMethods ;
	this.objectMethods = schema.objectMethods ;
	this.validate = collection.validate ;
	this.alterSchemaProperty = schema.alterSchemaProperty ;
	this.versioning = schema.versioning ;

	this.slugGeneration = schema.slugGeneration ;
	this.autoCollection = schema.autoCollection ;
	this.unindexedQueries = schema.unindexedQueries ;	// allow filter and sort on unindexed properties
	this.queryLimit = schema.queryLimit || app.queryLimit || 1000 ;	// maximum number of item for collection queries
	this.restrictAccess = schema.restrictAccess ;		// Maximal access allowed for users

	this.beforeCreateHook = schema.hooks.beforeCreate && schema.hooks.beforeCreate.bind( app ) ;
	this.afterCreateHook = schema.hooks.afterCreate && schema.hooks.afterCreate.bind( app ) ;
	this.beforeModifyHook = schema.hooks.beforeModify && schema.hooks.beforeModify.bind( app ) ;
	this.afterModifyHook = schema.hooks.afterModify && schema.hooks.afterModify.bind( app ) ;
	this.beforeDeleteHook = schema.hooks.beforeDelete && schema.hooks.beforeDelete.bind( app ) ;
	this.afterDeleteHook = schema.hooks.afterDelete && schema.hooks.afterDelete.bind( app ) ;
	this.searchHook = schema.hooks.search && schema.hooks.search.bind( app ) ;

	this.allTags = doormen.getAllSchemaTags( this.schema ) ;
	for ( let tag of this.allTags ) { app.allCollectionTags.add( tag ) ; }

	// Add the collection to the app
	app.collectionNodes[ name ] = this ;

	// Add methods
	this.objectMethods.schema =
		this.collectionMethods.schema = CollectionNode.prototype.schemaMethod.bind( this ) ;
}

module.exports = CollectionNode ;

CollectionNode.prototype = Object.create( restQuery.Node.prototype ) ;
CollectionNode.prototype.constructor = CollectionNode ;



// WIP... Some parts are copy of roots-db collection schema...

// restQuery only accept a single hook per type
const restQueryHookSchema = {
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
			default: {} ,

			// All this part should use doormen.validateSchema(). But it does not work ATM for some unknown reasons
			of: {
				type: 'strictObject' ,
				extraProperties: true ,
				properties: {
					tags: {
						optional: true , sanitize: 'toArray' , type: 'array' , of: { type: 'string' }
					}
				}
			}
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
		slugGeneration: {
			type: 'strictObject' ,
			default: null ,
			// Extra properties are options of the slug generation, they should be listed, later...
			extraProperties: true ,
			properties: {
				properties: { type: 'array' , sanitize: 'toArray' , of: { type: 'string' } } ,
				retry: { type: 'boolean' , default: false } ,	// If duplicate key for slug, retry another slug
				joint: { type: 'string' , optional: true }
			}
		} ,
		autoCollection: { type: 'string' , default: null } ,
		unindexedQueries: { type: 'boolean' , default: false } ,
		queryLimit: { type: 'number' , default: null } ,
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



// Derivative Collections need that
CollectionNode.restQueryHookSchema = restQueryHookSchema ;

CollectionNode.ensureIndex = rootsDb.Collection.ensureIndex ;



// Executed at document creation (PUT, POST)
CollectionNode.prototype.initDocument = function( incomingDocument ) {
	this.generateSlug( incomingDocument ) ;
} ;



// Executed at document modification (PATCH)
CollectionNode.prototype.initPatch = function( incomingPatch ) {} ;



CollectionNode.prototype.generateSlug = function( incomingDocument ) {
	if ( ! incomingDocument.slugId && this.slugGeneration ) {
		var slug = this.slugGeneration.properties.map( property => {
			var value , schema ;

			value = tree.dotPath.get( incomingDocument , property ) ;

			// Apply sanitizers right now for that property
			try {
				schema = doormen.path( this.schema , property ) ;
				value = doormen( schema , value ) ;
			}
			catch ( error ) {
				// Ignore validation errors
				return ;
			}

			if ( ! value ) { return ; }

			if ( typeof value === 'object' ) {
				if ( Array.isArray( value ) ) { return value.join( '-' ) ; }
				if ( value instanceof Date ) { return value.toISOString().slice( 0 , 10 ) ; }
				return ;
			}

			return '' + value ;
		} )
			.filter( part => part )
			.join( this.slugGeneration.joint || '-' ) ;

		if ( slug ) {
			incomingDocument.slugId = restQuery.slugify( slug , this.slugGeneration ) ;
		}
	}
} ;



// It MUST be a document, not an incoming object
CollectionNode.prototype.retryGenerateSlug = function( document ) {
	if ( document.slugId.match( /--([0-9af]{14})$/ ) ) {
		// Dang!
		throw new Error( "Can't retry this slug because it already contains disambigation: " + document.slugId ) ;
	}

	var key = document.getKey() ;
	key = key.slice( 0 , 8 ) + key.slice( 18 , 24 ) ;

	// This would convert to base64 and thus reducing the size, but ATM Rest Query's slugs MUST be lower-cased
	//key = hash.base64Encode( Buffer.from( key , 'hex' ) , { url: true } ) ;

	// The length of the key is either 9 or 10, so we have to reduce the original slug size by 14+2
	document.slugId = document.slugId.slice( 0 , 56 ) + '--' + key ;
	//console.log( document.slugId ) ;

	return true ;
} ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function( ... args ) {
	return new restQuery.ObjectNode( this.app , this , ... args ) ;
} ;



// A wrapper for custom methods
CollectionNode.prototype.userMethodWrapper = async function( methodName , pathParts , incomingDocument , attachmentStreams , context ) {
	if ( ! this.collectionMethods[ methodName ] ) {
		return Promise.reject( ErrorStatus.notFound( "Method '" + methodName + "' not found." ) ) ;
	}

	// Reset output serializer, if any
	context.output.serializer = null ;
	context.output.serializerOptions = null ;

	// incomingDocument is inside context.input.document and attachmentStreams in context.input.attachmentStreams
	context.remainingPathParts = pathParts ;
	context.collectionNode = this ;

	// Init the driver before calling the method, because the method could use direct driver access
	if ( ! this.collection.driver.raw ) {
		await this.collection.driver.rawInit() ;
	}

	var response = await this.collectionMethods[ methodName ].call( this , context ) ;
	if ( response !== undefined ) { context.output.data = response ; }

	return context ;
} ;



// Check restricted access on that collection.
// Only used by GET on a collection for instance, just to speed up things (since Node.checkAccess() check that nonetheless).
// Also all use case may benefit that later.
CollectionNode.prototype.restrictedAccess = function( pathParts , context , accessType , accessLevel ) {
	if ( context.batchOf || ! this.restrictAccess || context.input.performer.system ) {
		return false ;
	}

	var i , iMax ;

	for ( i = 1 , iMax = pathParts.length ; i < iMax ; i ++ ) {
		switch ( pathParts[ i ].type ) {
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



CollectionNode.prototype._get = async function( pathParts , context ) {
	var query , dbGetOptions = {} , batch , document ;

	if ( ! context.input.system ) {
		if ( context.input.access === true ) {
			context.input.access = new Set( this.allTags ) ;
			context.input.access.delete( 'security' ) ;
		}
		else if ( context.input.access instanceof Set ) {
			context.input.access.delete( 'security' ) ;
		}

		if ( context.input.populateAccess === true ) {
			context.input.populateAccess = new Set( this.app.allCollectionTags ) ;
			context.input.populateAccess.delete( 'security' ) ;
		}
		else if ( context.input.populateAccess instanceof Set ) {
			context.input.populateAccess.delete( 'security' ) ;
		}
	}

	if ( context.input.access instanceof Set ) {
		dbGetOptions.tagMask = context.input.access ;
		//dbGetOptions.enumerateMasking = true ;
	}

	if ( pathParts.length === 0 ) {
		if ( this.restrictedAccess( pathParts , context , 'read' , 1 ) ) {
			throw ErrorStatus.forbidden( "Access forbidden." ) ;
		}

		// Check query integrity now
		await this.checkQuery( context ) ;

		if ( context.input.query.populate ) {
			dbGetOptions.populate = context.input.query.populate ;

			if ( context.input.populateAccess instanceof Set ) {
				dbGetOptions.populateTagMask = context.input.populateAccess ;
			}

			context.output.serializer = restQuery.serializers.toJsonLocalEnumerateAndDocumentDepth ;
			context.output.serializerOptions = [ 2 ] ;
		}
		else {
			context.output.serializer = restQuery.serializers.toJsonLocalEnumerate ;
			context.output.serializerOptions = null ;
		}

		// ------------------------------------------------- CLEAN UP / Create new right management options ---------------------------------------
		if ( context.input.query.limit ) {
			dbGetOptions.limit = context.input.query.limit ;
		}

		if ( context.input.query.skip ) {
			dbGetOptions.skip = context.input.query.skip ;
		}

		if ( context.input.query.sort ) {
			dbGetOptions.sort = context.input.query.sort ;
		}
		// ------------------------------------------------- CLEAN UP -----------------------------------------------------------------------------

		// ------------------------------------------------- CLEAN UP / Create new right management options ---------------------------------------
		if ( context.input.query.filter ) {
			query = context.input.query.filter ;
		}
		else {
			query = {} ;
		}
		// ------------------------------------------------- CLEAN UP -----------------------------------------------------------------------------

		if ( context.batchOf ) {
			query._id = { $in: context.batchOf } ;
		}
		else {
			query['parent.id'] = context.parentObjectNode.id ;
		}

		batch = await this.collection.find( query , dbGetOptions ) ;
		return this.getBatch( batch , context ) ;
	}

	if ( pathParts.length === 1 && pathParts[ 0 ].type !== 'method' ) {
		// Check query integrity now
		await this.checkQuery( context ) ;

		if ( context.input.query.populate ) {
			dbGetOptions.populate = context.input.query.populate ;

			if ( context.input.populateAccess instanceof Set ) {
				dbGetOptions.populateTagMask = context.input.populateAccess ;
			}

			dbGetOptions.noReference = true ;
			context.output.serializer = restQuery.serializers.toJsonLocalEnumerateAndDocumentDepth ;
			context.output.serializerOptions = [ 2 ] ;
		}
		else {
			context.output.serializer = restQuery.serializers.toJsonLocalEnumerate ;
			context.output.serializerOptions = null ;
		}
	}

	// Pass through that collection!

	switch ( pathParts[ 0 ].type ) {
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'read' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( this.restrictedAccess( pathParts , context , 'read' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		case 'method' :
			if ( this.restrictedAccess( pathParts , context , 'traverse' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			return this.userMethodWrapper( pathParts[ 0 ].identifier , pathParts , null , null , context ) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query , dbGetOptions ) ;

	// we instanciate an objectNode to query
	var objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return objectNode._get(
		pathParts.slice( 1 ) ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			linker: context.linker ,
			linkerPath: context.linkerPath ,
			batchOf: context.batchOf
		}
	) ;
} ;



// Callback after the batch query is performed, and about to be sent to the client
CollectionNode.prototype.getBatch = function( batch , context ) {
	var filteredBatch = [] ;

	// /!\ Use Promise.filter() ? /!\
	return Promise.forEach( batch , element =>
		this.checkReadAccess( context , element , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] )
			.then( () => { filteredBatch.push( element ) ; } )
			.catch( () => null )
	).then( () => {
		var afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,

			// /!\ should filteredBatch be transformed to a regular Roots-DB Batch? /!\
			batch: filteredBatch ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ;

		afterContext.output.data = filteredBatch ;

		return afterContext ;
	} ) ;
} ;



CollectionNode.prototype._post = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var query , document ;

	if ( pathParts.length === 0 ) {
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a POST request, posting on a collection, should be a strict Object." ) ;
		}

		if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) ) {
			throw ErrorStatus.forbidden( "Access forbidden." ) ;
		}

		await this.checkCreateAccess( context ) ;
		return this.postDocument( pathParts , incomingDocument , attachmentStreams , context ) ;
	}


	switch ( pathParts[ 0 ].type ) {
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		case 'method' :
			if ( this.restrictedAccess( pathParts , context , 'traverse' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			return this.userMethodWrapper( pathParts[ 0 ].identifier , pathParts , incomingDocument , attachmentStreams , context ) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query ) ;

	// The resource exists, overwrite or access should be done by the underlying ObjectNode
	var objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return objectNode._post(
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
		}
	) ;
} ;



CollectionNode.prototype.postDocument = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var id , beforeContext , afterContext ;

	if ( context.batchOf ) {
		// Strange?
		incomingDocument.parent = {
			collection: 'root' ,
			id: '/'
		} ;
	}
	else {
		incomingDocument.parent = {
			collection: context.parentObjectNode.collectionNode && context.parentObjectNode.collectionNode.name ,
			id: context.parentObjectNode.id
		} ;
	}

	// Create an ID for it, for beforeCreate hook (not sure if it's really useful)
	id = this.collection.checkId( incomingDocument , true ) ;

	if ( this.beforeCreateHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			incomingDocument: incomingDocument ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ;

		await this.beforeCreateHook( beforeContext ) ;
	}

	try {
		this.initDocument( incomingDocument ) ;
		this.checkAlterSchema( incomingDocument , context ) ;
		incomingDocument = this.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	try {
		// Save eventual attachment streams as well
		await incomingDocument.save( { attachmentStreams: attachmentStreams } ) ;
	}
	catch ( error ) {
		if ( error.code === 'duplicateKey' && error.indexProperties[ 0 ] === 'slugId' && this.slugGeneration.retry ) {
			try {
				this.retryGenerateSlug( incomingDocument ) ;
				log.debug( "Duplicate key error due to a conflict with the slug, retrying with another slug: %s" , incomingDocument.slugId ) ;
				await incomingDocument.save( { attachmentStreams: attachmentStreams } ) ;
			}
			catch ( error_ ) {
				throw this.transformError( error_ ) ;
			}
		}
		else {
			throw this.transformError( error ) ;
		}
	}

	context.output.httpStatus = 201 ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: incomingDocument ,
		collectionNode: this ,
		objectNode: this.createObjectNode( incomingDocument , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter )
	} ;

	afterContext.output.data = {
		id: id ,
		slugId: incomingDocument.slugId
	} ;

	if ( context.batchOf ) {
		context.linker.object.addLink( context.linkerPath , incomingDocument ) ;

		afterContext.batchOf = context.batchOf ;
		afterContext.linker = context.linker ;

		try {
			await context.linker.object.commit() ;
		}
		catch ( error ) {
			log.error( "The object's commit failed, but the request had already succeeded: %E" , error ) ;
			// Send 201 anyway?
			return afterContext ;
		}
	}

	if ( this.afterCreateHook ) {
		try {
			await this.afterCreateHook( afterContext ) ;
		}
		catch ( error ) {
			log.error( "The 'afterCreateHook' failed, but the request had already succeeded: %E" , error ) ;
			// Send 201 anyway?
			return afterContext ;
		}
	}

	return afterContext ;
} ;



CollectionNode.prototype._put = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var objectNode , document , notFound = false ;

	if ( pathParts.length === 0 ) {
		throw ErrorStatus.badRequest( 'Cannot perform a PUT on a collection node' ) ;
	}

	switch ( pathParts[ 0 ].type ) {
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , null , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf && ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) ) {
				throw ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ;
			}

			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			context.slugMode = false ;

			try {
				document = await this.collection.get( pathParts[ 0 ].identifier ) ;
			}
			catch ( error ) {
				if ( error.type === 'notFound' && pathParts.length === 1 ) { notFound = true ; }
				else { throw error ; }
			}

			break ;

		case 'slugId' :
			if ( this.restrictedAccess( pathParts , context , null , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			context.slugMode = true ;

			try {
				document = await this.collection.getUnique( { slugId: pathParts[ 0 ].identifier , "parent.id": context.parentObjectNode.id } ) ;
			}
			catch ( error ) {
				if ( error.type === 'notFound' && pathParts.length === 1 ) { notFound = true ; }
				else { throw error ; }
			}

			break ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}

	if ( notFound ) {
		// This is a normal case: the target does not exist yet,
		// and should be created by the request

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ;
		}

		if ( this.restrictedAccess( pathParts , context , 'create' , 1 ) ) {
			throw ErrorStatus.forbidden( "Access forbidden." ) ;
		}

		await this.checkCreateAccess( context ) ;
		return this.putNewDocument( pathParts , incomingDocument , attachmentStreams , context ) ;
	}

	if ( document.parent.id.toString() !== context.parentObjectNode.id.toString() ) {
		throw ErrorStatus.badRequest( 'Ambigous PUT request: this ID exists but is the child of another parent.' ) ;
	}

	/*
		/!\ access 4 or 5?
		Or should a special access type 'replace' be created?
		Or double-check for 'delete' on this node and 'create' on the parent node?
		Well, 'write 4' looks ok: one should have a 'restricted' access to the ressource.
	*/
	if ( this.restrictedAccess( pathParts , context , 'write' , 4 ) ) {
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}

	// The resource exists, overwrite or access should be done by the underlying ObjectNode
	objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return objectNode._put(
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
		}
	) ;
} ;



CollectionNode.prototype.putNewDocument = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var id , beforeContext , afterContext ;

	incomingDocument.parent = {
		collection: context.parentObjectNode.collectionNode && context.parentObjectNode.collectionNode.name ,
		id: context.parentObjectNode.id
	} ;

	if ( context.slugMode ) {
		id = this.collection.setId( incomingDocument ) ;
		incomingDocument.slugId = pathParts[ 0 ].identifier ;
	}
	else {
		id = this.collection.setId( incomingDocument , pathParts[ 0 ].identifier ) ;
	}

	if ( this.beforeCreateHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			incomingDocument: incomingDocument ,
			collectionNode: this ,
			parentObjectNode: context.parentObjectNode
		} ;

		await this.beforeCreateHook( beforeContext ) ;
	}

	try {
		this.initDocument( incomingDocument ) ;
		this.checkAlterSchema( incomingDocument , context ) ;
		incomingDocument = this.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	try {
		// overwrite:true for race conditions?
		await incomingDocument.save( { overwrite: true , attachmentStreams: attachmentStreams } ) ;
	}
	catch ( error ) {
		if ( error.code === 'duplicateKey' && error.indexProperties[ 0 ] === 'slugId' && this.slugGeneration.retry ) {
			try {
				this.retryGenerateSlug( incomingDocument ) ;
				log.debug( "Duplicate key error due to a conflict with the slug, retrying with another slug: %s" , incomingDocument.slugId ) ;
				await incomingDocument.save( { overwrite: true , attachmentStreams: attachmentStreams } ) ;
			}
			catch ( error_ ) {
				throw this.transformError( error_ ) ;
			}
		}
		else {
			throw this.transformError( error ) ;
		}
	}

	context.output.httpStatus = 201 ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: incomingDocument ,
		collectionNode: this ,
		objectNode: this.createObjectNode( incomingDocument , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter )
	} ;

	afterContext.output.data = {
		id: id ,
		slugId: incomingDocument.slugId
	} ;

	if ( this.afterCreateHook ) {
		try {
			await this.afterCreateHook( afterContext ) ;
		}
		catch ( error ) {
			log.error( "The 'afterCreateHook' failed, but the request had already succeeded: %E" , error ) ;
			// Send 201 anyway?
			return afterContext ;
		}
	}

	return afterContext ;
} ;



CollectionNode.prototype._patch = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var query , document , objectNode ;

	if ( pathParts.length === 0 ) {
		throw ErrorStatus.badRequest( 'Cannot perform a PATCH on a collection node' ) ;
	}


	switch ( pathParts[ 0 ].type ) {
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'write' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( this.restrictedAccess( pathParts , context , 'write' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query ) ;

	// The resource exists, overwrite or access should be done by the underlying ObjectNode
	objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return objectNode._patch(
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
		}
	) ;
} ;



CollectionNode.prototype._delete = async function( pathParts , context ) {
	var query , document , objectNode ;

	if ( pathParts.length === 0 ) {
		throw ErrorStatus.badRequest( 'Cannot perform a DELETE on a collection node' ) ;
	}


	switch ( pathParts[ 0 ].type ) {
		case 'id' :
			if ( this.restrictedAccess( pathParts , context , 'delete' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "'" + pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( this.restrictedAccess( pathParts , context , 'delete' , 1 ) ) {
				throw ErrorStatus.forbidden( "Access forbidden." ) ;
			}

			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query ) ;

	// The resource exists, delete or access should be done by the underlying ObjectNode
	objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return objectNode._delete(
		pathParts.slice( 1 ) ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			linker: context.linker ,
			linkerPath: context.linkerPath ,
			batchOf: context.batchOf
		}
	) ;
} ;



/*
	Operators that will be supported:
		- comparison: $in, $nin, $gt, $gte, $lt, $lte, $eq, $ne
		- maybe evaluation: $regex, $text, $mod
*/
const ALLOWED_OPERATOR_FILTERS = new Set( [ '$in' , '$nin' , '$gt' , '$gte' , '$lt' , '$lte' , '$eq' , '$ne' ] ) ;
const ELEMENT_OPERATOR_FILTERS = new Set( [ '$in' , '$nin' ] ) ;

CollectionNode.prototype.checkQuery = async function( context ) {
	var hasDollar , hasNonDollar , key , innerKey , subSchema , outerSubSchema , innerSubSchema ,
		query = context.input.query ;

	if ( query.isChecked ) { return ; }

	// Enforce the limit
	if ( ! query.limit || query.limit > this.queryLimit ) { query.limit = this.queryLimit ; }

	if ( query.sort ) {
		for ( key in query.sort ) {
			if ( ! this.unindexedQueries && ! this.collection.indexedProperties[ key ] ) {
				throw ErrorStatus.badRequest( "Cannot sort on property '" + key + "' on this collection" ) ;
			}

			switch ( query.sort[ key ] ) {
				case 1 :
				case '1' :
				case 'asc' :
				case 'ascendant' :
					query.sort[ key ] = 1 ;
					break ;
				case -1 :
				case '-1' :
				case 'desc' :
				case 'descendant' :
					query.sort[ key ] = -1 ;
					break ;
				default :
					delete query.sort[ key ] ;
			}
		}
	}

	// TODO...
	// /!\ Should check if the populate field is OK.
	// /!\ Don't know if the whole "populate security model" should be checked here, or if this is just an anti-WTF filter.
	// /!\ check if the populated value is authorized by the current accessTags (avoid unecessary server computing)
	//		--> not possible beforehand, since the object should be retrieved first to know if populate is possible...

	// Filtering operation
	if ( query.filter ) {
		for ( key in query.filter ) {
			if ( key[ 0 ] === '$' ) {
				throw ErrorStatus.badRequest( "Unsupported top-level filter '" + key + "'" ) ;
			}

			subSchema = outerSubSchema = innerSubSchema = doormen.path( this.collection.documentSchema , key ) ;

			if ( outerSubSchema.type === 'array' || outerSubSchema.type === 'multiLink' ) {
				// Here we kept the MongoDB behavior: when the target is an array, most of time we filter array's elements
				subSchema = innerSubSchema = outerSubSchema.of || {} ;
			}

			if ( ! this.unindexedQueries && ! this.collection.indexedProperties[ key ] ) {
				throw ErrorStatus.badRequest( "Cannot filter on property '" + key + "' on this collection without 'unindexedQueries'" ) ;
			}

			if ( query.filter[ key ] && typeof query.filter[ key ] === 'object' ) {
				hasDollar = false ;
				hasNonDollar = false ;

				for ( innerKey in query.filter[ key ] ) {
					if ( innerKey[ 0 ] === '$' ) {
						hasDollar = true ;
						if ( hasNonDollar ) {
							throw ErrorStatus.badRequest( "Value is mixing regular properties with '$' operators" ) ;
						}

						if ( ! ALLOWED_OPERATOR_FILTERS.has( innerKey ) ) {
							throw ErrorStatus.badRequest( "Unsupported filter '" + innerKey + "'" ) ;
						}

						if ( innerSubSchema !== outerSubSchema && ! ELEMENT_OPERATOR_FILTERS.has( innerKey ) ) {
							// In this case we do not filter on array's elements
							subSchema = outerSubSchema ;
						}

						if ( innerKey === '$in' || innerKey === '$nin' ) {
							// Those filters accept array of values
							if ( ! Array.isArray( query.filter[ key ][ innerKey ] ) ) {
								query.filter[ key ][ innerKey ] = [ this.doormenThrowingBadRequest( subSchema , query.filter[ key ][ innerKey ] , "Bad query %s filter for key '%s'" , innerKey , key ) ] ;
							}
							else {
								query.filter[ key ][ innerKey ].forEach( ( value , index ) =>
									query.filter[ key ][ innerKey ][ index ] = this.doormenThrowingBadRequest( subSchema , value , "Bad query %s filter for key '%s'" , innerKey , key )
								) ;
							}
						}
						else {
							// Regular value
							query.filter[ key ][ innerKey ] = this.doormenThrowingBadRequest( subSchema , query.filter[ key ][ innerKey ] , "Bad query %s filter for key '%s'" , innerKey , key ) ;
						}
					}
					else {
						hasNonDollar = true ;
						if ( hasDollar ) {
							throw ErrorStatus.badRequest( "Value is mixing regular properties with '$' operators" ) ;
						}
					}
				}

				if ( ! hasDollar ) {
					query.filter[ key ] = this.doormenThrowingBadRequest( subSchema , query.filter[ key ] , "Bad query non-$ filter for key '%s'" , key ) ;
				}
			}
			else {
				query.filter[ key ] = this.doormenThrowingBadRequest( subSchema , query.filter[ key ] , "Bad query non-$ filter for key '%s'" , key ) ;
			}
		}
	}

	if ( query.search ) {
		if ( typeof query.search === 'number' ) {
			// Cast to a string
			query.search = '' + query.search ;
		}

		if ( ! query.filter ) { query.filter = {} ; }

		if ( this.searchHook ) {
			await this.searchHook( context ) ;
		}

		// If after the hook there is still a 'search' parameter, perform the default behavior
		if ( query.search ) {
			if ( ! this.collection.hasTextIndex ) {
				throw ErrorStatus.badRequest( "Cannot perform a text search on this collection" ) ;
			}
			else {
				query.filter.$text = {
					$search: query.search
				} ;
			}
		}
	}

	query.isChecked = true ;
} ;



/*
	checkReadAccess( context , element , ancestors )
*/
CollectionNode.prototype.checkReadAccess = async function( context , object , ancestors ) {
	await restQuery.Node.checkAccess( {
		performer: context.input.performer ,
		accessType: 'read' ,
		requiredAccess: context.input.access ,
		collectionNode: this ,
		object ,
		ancestors
	} ) ;

	if ( context.input.query.populate ) {
		return restQuery.Node.checkAccess( {
			performer: context.input.performer ,
			accessType: 'read' ,
			requiredAccess: context.input.populateAccess ,
			collectionNode: this ,
			object ,
			ancestors
		} ) ;
	}
} ;



/*
	checkCreateAccess( context )
*/
CollectionNode.prototype.checkCreateAccess = function( context ) {
	return restQuery.Node.checkAccess( {
		performer: context.input.performer ,
		accessType: 'create' ,
		requiredAccess: true ,
		collectionNode: context.parentObjectNode.collectionNode ,
		object: context.parentObjectNode.object ,
		ancestors: context.parentObjectNode.ancestors
	} ) ;
} ;



CollectionNode.prototype.checkAlterSchema = function( document , context , isPatch ) {
	if ( context.alter && context.alter.schema && context.alter.schema[ this.name ] ) {
		if ( isPatch ) { doormen.patch( context.alter.schema[ this.name ] , document ) ; }
		else { doormen( context.alter.schema[ this.name ] , document ) ; }
	}
} ;



CollectionNode.prototype.mergedSchema = function( context ) {
	var schema , alterSchema , options = { own: true } ;

	if ( context.alter && context.alter.schema && ( alterSchema = context.alter.schema[ this.name ] ) ) {
		log.info( "Alter schema detected" ) ;
		schema = tree.extend( options , {} , this.schema ) ;
		schema.properties = tree.extend( options , {} , this.schema.properties , alterSchema.properties ) ;
		if ( 'extraProperties' in alterSchema ) { schema.extraProperties = alterSchema.extraProperties ; }
		return schema ;
	}

	return this.schema ;

} ;





/* Methods */



// Used with GET, retrieve the schema of the current collection
CollectionNode.prototype.schemaMethod = function( context ) {
	if ( context.input.method !== 'get' ) {
		return Promise.reject( ErrorStatus.badRequest( 'Methods not compatible' ) ) ;
	}

	context.output.serializer = restQuery.serializers.toJsonMask ;
	context.output.serializerOptions = [ {
		// Sure:
		templateData: true ,
		collectionName: true ,
		extraProperties: true ,
		properties: true ,

		// Maybe:
		path: true ,
		defaultPublicAccess: true ,
		autoCollection: true ,
		indexes: true ,
		role: true
	} ] ;

	context.output.data = this.mergedSchema( context ) ;

	return Promise.resolved ;
} ;

