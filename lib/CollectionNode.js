/*
	Rest Query

	Copyright (c) 2014 - 2021 Cédric Ronvel

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
//const Context = require( './Context.js' ) ;
const ErrorStatus = require( 'error-status' ) ;
const rootsDb = require( 'roots-db' ) ;
const restQuery = require( './restQuery.js' ) ;
const hash = require( 'hash-kit' ) ;
const string = require( 'string-kit' ) ;
const arrayKit = require( 'array-kit' ) ;

const tree = require( 'tree-kit' ) ;
const deepExtend = tree.extend.bind( null , { deep: true } ) ;

const doormen = require( 'doormen' ) ;
const IS_EQUAL_UNORDERED = { unordered: true } ;
const SLUG_INDEX = [ 'slugId' , 'parent.id' ] ;
const HID_INDEX = [ 'hid' , 'parent.id' ] ;

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

	if ( schema.hidGeneration ) {
		schema.properties.hid = {
			type: 'restQuery.hid' ,
			system: true ,
			tags: [ 'id' ] ,
			sanitize: 'restQuery.toHid'
		} ;
	}

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
	schema.properties.publicAccess.default = schema.defaultPublicAccess || app.defaultPublicAccess ;

	schema.indexes.push( { properties: { "parent.id": 1 } } ) ;
	schema.indexes.push( { properties: { slugId: 1 , "parent.id": 1 } , unique: true } ) ;
	if ( schema.hidGeneration ) { schema.indexes.push( { properties: { hid: 1 , "parent.id": 1 } , unique: true } ) ; }

	// Call the parent constructor
	restQuery.Node.call( this , app ) ;

	// First check the child name
	//restQueryName = name[ 0 ].toUpperCase() + name.slice( 1 ) ;
	restQueryName = name[ 0 ].toLowerCase() + name.slice( 1 ) ;

	// Create the ODM collection
	collection = app.world.createCollection( name , schema ) ;

	this.name = restQueryName ;
	this.isInit = false ;
	this.collection = collection ;
	this.schema = schema ;
	this.collectionMethods = Object.assign( {} , schema.collectionMethods ) ;
	this.objectMethods = Object.assign( {} , schema.objectMethods ) ;
	this.validate = collection.validate ;
	this.alterSchemaProperty = schema.alterSchemaProperty ;
	this.versioning = schema.versioning ;
	this.deepPopulateLimit = schema.deepPopulateLimit ;

	this.slugGeneration = schema.slugGeneration ;
	this.hidGeneration = schema.hidGeneration ;
	this.fakeLinkGeneration = schema.fakeLinkGeneration ;
	this.autoCollection = schema.autoCollection ;
	this.unindexedQueries = schema.unindexedQueries ;	// allow filter and sort on unindexed properties
	this.queryLimit = schema.queryLimit || app.queryLimit || 100 ;	// maximum number of item for collection queries

	this.hooks = schema.hooks || {} ;

	// Add tags
	this.allTags = doormen.getAllSchemaTags( this.schema ) ;
	for ( let tag of this.allTags ) { app.allCollectionTags.add( tag ) ; }

	this.allExecTags = new Set() ;

	for ( let methodName in this.objectMethods ) {
		let method = this.objectMethods[ methodName ] ;
		if ( method.tags ) {
			for ( let tag of method.tags ) {
				this.allExecTags.add( tag ) ;
				this.app.allCollectionExecTags.add( tag ) ;
			}
		}
	}

	for ( let methodName in this.collectionMethods ) {
		let method = this.collectionMethods[ methodName ] ;
		if ( method.tags ) {
			for ( let tag of method.tags ) {
				this.allExecTags.add( tag ) ;
				this.app.allCollectionExecTags.add( tag ) ;
			}
		}
	}


	// Add the collection to the app
	app.collectionNodes[ name ] = this ;

	// Add methods
	this.addCollectionMethods( 'schemaMethod' , 'generateFakeMethod' ) ;
	this.addObjectMethods( 'schemaMethod' , 'regenerateSlugMethod' , 'regenerateHidMethod' ) ;
}

module.exports = CollectionNode ;

CollectionNode.prototype = Object.create( restQuery.Node.prototype ) ;
CollectionNode.prototype.constructor = CollectionNode ;



// WIP... Some parts are copy of roots-db collection schema...

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
		refreshTimeout: { type: 'number' , default: 1000 } ,
		deepPopulateLimit: { type: 'number' , default: 2 } ,	// Depth-limit for deep-populate
		indexes: {
			type: 'array' ,
			default: []
		} ,
		defaultPublicAccess: tree.extend( { deep: true } , {} , restQuery.accessSchema , { optional: true } ) ,
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
			// Extra properties are options for the slug generation, they should be listed, later...
			extraProperties: true ,
			properties: {
				properties: { type: 'array' , sanitize: 'toArray' , of: { type: 'string' } } ,
				retry: { type: 'boolean' , default: false } ,	// If duplicate key for slug, retry another slug
				joint: { type: 'string' , optional: true }
			}
		} ,
		fakeLinkGeneration: {
			type: 'strictObject' ,
			default: null ,
			of: {
				type: 'strictObject' ,
				properties: {
					limit: { type: 'integer' , optional: true } ,
					chance: { type: 'number' , optional: true } ,
					min: { type: 'integer' , optional: true } ,
					max: { type: 'integer' , optional: true }
				}
			}
		} ,
		hidGeneration: {
			type: 'strictObject' ,
			default: null ,
			// Extra properties are options for the hid generation, they should be listed, later...
			extraProperties: true ,
			properties: {
				properties: { type: 'array' , sanitize: 'toArray' , of: { type: 'string' } } ,
				retry: { type: 'boolean' , default: false } ,	// If duplicate key for hid, retry another hid
				joint: { type: 'string' , optional: true }
			}
		} ,
		autoCollection: { type: 'string' , default: null } ,
		unindexedQueries: { type: 'boolean' , default: false } ,
		queryLimit: { type: 'number' , default: null } ,
		hooks: {
			type: 'strictObject' ,
			default: {} ,
			of: restQuery.hooks.schema
		}
	}
} ;



CollectionNode.prototype.init = async function() {
	if ( this.isInit ) { return ; }
	await this.collection.init() ;
	this.isInit = true ;
} ;



CollectionNode.prototype.addMethods = function( isObjectType , ... methods ) {
	var method , name ;

	for ( method of methods ) {
		if ( typeof method === 'function' ) {
			name = method.name ;
		}
		else if ( typeof method === 'string' ) {
			name = method ;
			method = this[ name ].bind( this ) ;
			method.tags = this[ name ].tags ;
			name = name.replace( /Method$/ , '' ) ;
		}
		else {
			continue ;
		}

		this[ isObjectType ? 'objectMethods' : 'collectionMethods' ][ name ] = method ;

		if ( method.tags ) {
			for ( let tag of method.tags ) {
				this.allExecTags.add( tag ) ;
				this.app.allCollectionExecTags.add( tag ) ;
			}
		}
	}
} ;

CollectionNode.prototype.addObjectMethods = function( ... methods ) { return this.addMethods( true , ... methods ) ; } ;
CollectionNode.prototype.addCollectionMethods = function( ... methods ) { return this.addMethods( false , ... methods ) ; } ;



// Executed at document creation (PUT, POST)
CollectionNode.prototype.initDocument = function( incomingDocument ) {
	this.generateSlug( incomingDocument ) ;
	this.generateHid( incomingDocument ) ;
} ;



// Executed at document modification (PATCH)
CollectionNode.prototype.initPatch = function( incomingPatch ) {} ;



// Executed after the document modification, but before commiting it to the DB
CollectionNode.prototype.afterPatch = function( object , incomingPatch ) {
	this.afterPatchUpdateHid( object , incomingPatch ) ;
} ;



CollectionNode.prototype.generateSlug = function( incomingDocument ) {
	if ( incomingDocument.slugId || ! this.slugGeneration ) { return ; }

	var slug = this.slugGeneration.properties.map( property => {
		var value , schema ;

		value = tree.dotPath.get( incomingDocument , property ) ;

		// Apply sanitizers right now for that property
		try {
			schema = doormen.path( this.schema , property ) ;
			// Use doormen.export(): DO NOT CHANGE THE BASE OBJECT!!!
			value = doormen.export( schema , value ) ;
		}
		catch ( error ) {
			// Ignore validation errors
			return ;
		}

		if ( ! value ) { return ; }

		if ( typeof value === 'object' ) {
			if ( Array.isArray( value ) ) { return value.map( v => ( '' + v ).trim() ).join( '-' ) ; }
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
} ;



CollectionNode.prototype.generateHid = function( incomingDocument ) {
	if ( ! this.hidGeneration ) { return ; }

	var hid = this.hidGeneration.properties.map( property => {
		var value , schema ;

		value = tree.dotPath.get( incomingDocument , property ) ;

		// Apply sanitizers right now for that property
		try {
			schema = doormen.path( this.schema , property ) ;
			// Use doormen.export(): DO NOT CHANGE THE BASE OBJECT!!!
			value = doormen.export( schema , value ) ;
		}
		catch ( error ) {
			// Ignore validation errors
			return ;
		}

		if ( ! value ) { return ; }

		if ( typeof value === 'object' ) {
			if ( Array.isArray( value ) ) { return '(' + value.map( v => ( '' + v ).trim() ).join( ', ' ) + ')' ; }
			if ( value instanceof Date ) { return value.toISOString().slice( 0 , 10 ) ; }
			return ;
		}

		return '' + value ;
	} )
		.filter( part => part )
		.join( this.hidGeneration.joint || ' ' ) ;

	if ( hid ) { incomingDocument.hid = hid ; }
} ;



CollectionNode.prototype.afterPatchUpdateHid = function( object , incomingPatch ) {
	if ( ! this.hidGeneration || ! this.hidGeneration.properties.some( property => property in incomingPatch ) ) { return ; }
	this.generateHid( object ) ;
} ;



const RETRY_ALL = { slug: true , hid: true } ;

/*
	document: It MUST be a document, not an incoming object
	error: the error that need to be fixed
	saveOptions: passed to document.save()
	retryOnly: object or null, used to only support retrying those things, e.g. { slug: true } = retry only the slug
	retryCount: how many time we can retry
*/
CollectionNode.prototype.manageRetry = async function( document , firstError , mode = 'save' , modeOptions = undefined , retryOnly = RETRY_ALL , retryCount = 3 ) {
	var error = firstError ,
		slugCount = 0 ,
		hidCount = 0 ;

	while ( error ) {
		if ( error.code !== 'duplicateKey' ) { throw this.transformError( error ) ; }

		if ( retryOnly.slug && slugCount < retryCount && this.slugGeneration?.retry && doormen.isEqual( error.indexProperties , SLUG_INDEX , IS_EQUAL_UNORDERED ) ) {
			slugCount ++ ;
			this.retryGenerateSlug( document ) ;
		}
		else if ( retryOnly.hid && hidCount < retryCount && this.hidGeneration?.retry && doormen.isEqual( error.indexProperties , HID_INDEX , IS_EQUAL_UNORDERED ) ) {
			hidCount ++ ;
			this.retryGenerateHid( document ) ;
		}
		else {
			throw this.transformError( error ) ;
		}

		try {
			// Save eventual attachment streams as well
			await document[ mode ]( modeOptions ) ;
			error = null ;
		}
		catch ( newError ) {
			error = newError ;
		}
	}
} ;



CollectionNode.prototype.retryGenerateSlug = function( object ) {
	if ( object.slugId.match( /--[0-9]{1,3}$/ ) ) {
		// There is already some disambigation code at the end, just replace it...
		object.slugId = object.slugId.replace( /--[0-9]{1,3}$/ , '--' + hash.randomNumberString( 3 ) ) ;
	}
	else {
		// Don't forget that now slugs can contain unicode chars! Max length is 67+2+2=72 unicode chars.
		object.slugId = string.unicode.truncateWidth( object.slugId , 67 ) + '--' + hash.randomNumberString( 3 ) ;
	}
} ;



CollectionNode.prototype.retryGenerateHid = function( object ) {
	if ( object.hid.match( / \([0-9]{1,3}\)$/ ) ) {
		// There is already some disambigation code at the end, just replace it...
		object.hid = object.hid.replace( / \([0-9]{1,3}\)$/ , ' (' + hash.randomNumberString( 3 ) + ')' ) ;
	}
	else {
		object.hid = object.hid + ' (' + hash.randomNumberString( 3 ) + ')' ;
	}
} ;



// Here we create an ObjectNode of part of the current CollectionNode
CollectionNode.prototype.createObjectNode = function( ... args ) {
	return new restQuery.ObjectNode( this.app , this , ... args ) ;
} ;



// A wrapper for custom methods
CollectionNode.prototype.userMethodWrapper = async function( methodName , context ) {
	if ( ! this.collectionMethods[ methodName ] ) {
		return Promise.reject( ErrorStatus.notFound( "Method '" + methodName + "' not found." ) ) ;
	}

	await this.checkExecAccess( context , this.collectionMethods[ methodName ].tags ) ;

	// Reset output serializer, if any
	context.output.serializer = null ;
	context.output.serializerOptions = null ;

	// incomingDocument is inside context.input.document and attachmentStreams in context.input.attachmentStreams
	context.remainingPathParts = context.pathParts ;
	context.collectionNode = this ;

	// Init the driver before calling the method, because the method could use direct driver access
	if ( ! this.collection.driver.raw ) {
		await this.collection.driver.rawInit() ;
	}

	var response = await this.collectionMethods[ methodName ]( context ) ;
	if ( response !== undefined ) { context.output.data = response ; }

	return context ;
} ;



CollectionNode.prototype._get = async function( context ) {
	//log.hdebug( "CollectionNode#_get() pathParts: %Y" , context.pathParts ) ;
	var query , dbGetOptions = {} , batch , document , nextObjectNode ;

	if ( context.pathParts.length <= 1 ) {
		// So... we are about to perform the last query, either for a single object or a batch,
		// it's time to definitively fix 'access' and 'populateAccess'
		if ( ! context.performer.system ) {
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
	}

	if ( context.input.access instanceof Set ) {
		dbGetOptions.tagMask = context.input.access ;
		//dbGetOptions.enumerateMasking = true ;
	}

	if ( context.pathParts.length === 0 ) {
		// We are currently listing/querying the collection
		await this.checkQueryAccess( context ) ;

		// Check query integrity now
		await this.checkQuery( context ) ;

		if ( context.input.query.populate || context.input.query.deepPopulate ) {
			if ( context.input.query.populate ) {
				dbGetOptions.populate = context.input.query.populate ;
			}

			if ( context.input.query.deepPopulate ) {
				dbGetOptions.deepPopulate = context.input.query.deepPopulate ;
				dbGetOptions.depth = context.input.query.depth ?
					Math.min( context.input.query.depth , this.deepPopulateLimit ) :
					this.deepPopulateLimit ;
			}

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


	if ( context.pathParts[ 0 ].type === 'method' ) {
		return this.userMethodWrapper( context.pathParts[ 0 ].identifier , context ) ;
	}


	// Pass through that collection!

	if ( context.pathParts.length === 1 ) {
		// Check query integrity now
		await this.checkQuery( context ) ;

		if ( context.input.query.populate || context.input.query.deepPopulate ) {
			if ( context.input.query.populate ) {
				dbGetOptions.populate = context.input.query.populate ;
			}

			if ( context.input.query.deepPopulate ) {
				dbGetOptions.deepPopulate = context.input.query.deepPopulate ;
				dbGetOptions.depth = context.input.query.depth ?
					Math.min( context.input.query.depth , this.deepPopulateLimit ) :
					this.deepPopulateLimit ;
			}

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

	switch ( context.pathParts[ 0 ].type ) {
		case 'id' :
			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === context.pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "ID '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: context.pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: context.pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: context.pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found [CollectionNode]." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query , dbGetOptions ) ;

	// we instanciate an objectNode to query
	nextObjectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return nextObjectNode._get( context.nextObjectNode( nextObjectNode , true , true ) ) ;
} ;



// Callback after the batch query is performed, and about to be sent to the client
CollectionNode.prototype.getBatch = function( batch , context ) {
	var filteredBatch = [] ,
		ancestors = [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] ;

	// /!\ Use Promise.filter() ? /!\
	return Promise.forEach( batch , element =>
		this.checkBatchReadAccess( context , element , ancestors )
			.then( () => { filteredBatch.push( element ) ; } )
			.catch( () => null )
	).then( () => {
		// /!\ should filteredBatch be transformed to a regular Roots-DB Batch? /!\
		context.batch = filteredBatch ;
		context.output.data = filteredBatch ;

		return context ;
	} ) ;
} ;



CollectionNode.prototype._post = async function( context ) {
	var query , nextObjectNode , document ,
		incomingDocument = context.input.document ;

	if ( context.pathParts.length === 0 ) {
		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a POST request, posting on a collection, should be a strict Object." ) ;
		}

		await this.checkCreateAccess( context ) ;
		return this.postDocument( context ) ;
	}


	if ( context.pathParts[ 0 ].type === 'method' ) {
		return this.userMethodWrapper( context.pathParts[ 0 ].identifier , context ) ;
	}


	// Pass through that collection!

	switch ( context.pathParts[ 0 ].type ) {
		case 'id' :
			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === context.pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "ID '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: context.pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: context.pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: context.pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query ) ;

	// The resource exists, overwrite or access should be done by the underlying ObjectNode
	nextObjectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return nextObjectNode._post( context.nextObjectNode( nextObjectNode , true , true ) ) ;
} ;



CollectionNode.prototype.postDocument = async function( context , overrideIncomingDocument = null ) {
	var id , document , incomingDocument ;

	incomingDocument = overrideIncomingDocument || context.input.document ;

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

	if ( this.hooks.beforeCreate ) {
		await restQuery.hooks.run( this.hooks.beforeCreate , context , { incomingDocument } ) ;
		if ( context.isDone ) { return context ; }
	}

	try {
		this.initDocument( incomingDocument ) ;
		this.checkAlterSchema( incomingDocument , context ) ;
		document = context.document = this.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	try {
		// Save eventual attachment streams as well
		await document.save( { attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.manageRetry( document , error , 'save' , { attachmentStreams: context.input.attachmentStreams } ) ;
	}

	context.output.httpStatus = 201 ;
	context.output.data = {
		id: id ,
		slugId: document.slugId ,
		hid: document.hid
	} ;


	context.objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	if ( context.batchOf ) {
		context.linkerObjectNode.object.addLink( context.linkerPath , document ) ;

		try {
			await context.linkerObjectNode.object.commit() ;
		}
		catch ( error ) {
			log.error( "The linker object's commit failed, but the request had already succeeded: %E" , error ) ;
			context.nonFatalErrors.push( error ) ;
			// Send 201 anyway?
			return context ;
		}
	}

	if ( this.hooks.afterCreate ) { await restQuery.hooks.runAfter( this.hooks.afterCreate , context ) ; }

	return context ;
} ;



/*
	POST a batch of Documents.

	For instance the only way to create a batch of Documents is using the 'GENERATE-FAKE' method.

	It could be useful to either:
		* have a 'BATCH' method
		* or branch to postDocumentBatch when incomingDocument is an array instead of an object
*/
CollectionNode.prototype.postDocumentBatch = async function( context , overrideIncomingDocumentBatch = null ) {
	var id , document , incomingDocumentBatch , errorList = [] ,
		childContextList = [] , okChildContextList = [] , failedChildContextList = [] ;

	incomingDocumentBatch = overrideIncomingDocumentBatch || context.input.document ;

	// Attachment streams are not supported by batch operation
	delete context.input.attachmentStreams ;

	for ( let incomingDocument of incomingDocumentBatch ) {
		let childContext = context.createSubContext() ;
		childContextList.push( childContext ) ;

		try {
			await this.postDocument( childContext , incomingDocument ) ;
			if ( childContext.nonFatalErrors.length ) { context.nonFatalErrors.push( ... childContext.nonFatalErrors ) ; }
			okChildContextList.push( childContext ) ;
		}
		catch ( error ) {
			// We do it here (instead of out of the try-catch block) because to preserve the error order
			failedChildContextList.push( childContext ) ;
			if ( childContext.nonFatalErrors.length ) { context.nonFatalErrors.push( ... childContext.nonFatalErrors ) ; }
			context.nonFatalErrors.push( error ) ;
		}
	}


	context.output.httpStatus = okChildContextList.length || ! failedChildContextList.length ? 201 : 400 ;
	context.output.data = {
		ok: okChildContextList.length ,
		failed: failedChildContextList.length ,
		batch: okChildContextList.map( childContext => childContext.output.data ) ,
		nonFatalErrors: context.nonFatalErrors
	} ;
	//log.hdebug( "context.output.data: %I" , context.output.data ) ;

	return context ;
} ;



CollectionNode.prototype._put = async function( context ) {
	var nextObjectNode , document , notFound = false ,
		incomingDocument = context.input.document ;

	if ( context.pathParts.length === 0 ) {
		throw ErrorStatus.badRequest( 'Cannot perform a PUT on a collection node' ) ;
	}

	switch ( context.pathParts[ 0 ].type ) {
		case 'id' :
			if ( context.batchOf && ! context.batchOf.some( element => element.toString() === context.pathParts[ 0 ].identifier ) ) {
				throw ErrorStatus.notFound( "ID '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
			}

			// We cannot use collection.getUnique here, because of the ambigous PUT method (create or overwrite)
			context.slugMode = false ;

			try {
				document = await this.collection.get( context.pathParts[ 0 ].identifier ) ;
			}
			catch ( error ) {
				if ( error.type === 'notFound' && context.pathParts.length === 1 ) { notFound = true ; }
				else { throw error ; }
			}

			break ;

		case 'slugId' :
			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			context.slugMode = true ;

			try {
				document = await this.collection.getUnique( { slugId: context.pathParts[ 0 ].identifier , "parent.id": context.parentObjectNode.id } ) ;
			}
			catch ( error ) {
				if ( error.type === 'notFound' && context.pathParts.length === 1 ) { notFound = true ; }
				else { throw error ; }
			}

			break ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}

	if ( notFound ) {
		// This is a normal case: the target does not exist yet,
		// and should be created by the request

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ;
		}

		await this.checkCreateAccess( context ) ;
		return this.putNewDocument( context ) ;
	}

	if ( document.parent.id.toString() !== context.parentObjectNode.id.toString() ) {
		throw ErrorStatus.badRequest( 'Ambigous PUT request: this ID exists but is the child of another parent.' ) ;
	}

	// The resource exists, overwrite or access should be done by the underlying ObjectNode
	nextObjectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return nextObjectNode._put( context.nextObjectNode( nextObjectNode , true , true ) ) ;
} ;



CollectionNode.prototype.putNewDocument = async function( context ) {
	var id , document , incomingDocument ;

	incomingDocument = context.input.document ;

	incomingDocument.parent = {
		collection: context.parentObjectNode.collectionNode && context.parentObjectNode.collectionNode.name ,
		id: context.parentObjectNode.id
	} ;

	if ( context.slugMode ) {
		id = this.collection.setId( incomingDocument ) ;
		incomingDocument.slugId = context.pathParts[ 0 ].identifier ;
	}
	else {
		id = this.collection.setId( incomingDocument , context.pathParts[ 0 ].identifier ) ;
	}

	if ( this.hooks.beforeCreate ) {
		await restQuery.hooks.run( this.hooks.beforeCreate , context , { incomingDocument } ) ;
		if ( context.isDone ) { return context ; }
	}

	try {
		this.initDocument( incomingDocument ) ;
		this.checkAlterSchema( incomingDocument , context ) ;
		document = context.document = this.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	try {
		// overwrite:true for race conditions?
		await document.save( { overwrite: true , attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.manageRetry( document , error , 'save' , { attachmentStreams: context.input.attachmentStreams } ) ;
	}

	context.output.httpStatus = 201 ;
	context.output.data = {
		id: id ,
		slugId: document.slugId ,
		hid: document.hid
	} ;

	context.objectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	if ( this.hooks.afterCreate ) { await restQuery.hooks.runAfter( this.hooks.afterCreate , context ) ; }

	return context ;
} ;



CollectionNode.prototype._patch = async function( context ) {
	var query , document , nextObjectNode ;

	if ( context.pathParts.length === 0 ) {
		throw ErrorStatus.badRequest( 'Cannot perform a PATCH on a collection node' ) ;
	}


	switch ( context.pathParts[ 0 ].type ) {
		case 'id' :
			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === context.pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "ID '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: context.pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: context.pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: context.pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query ) ;

	// The resource exists, overwrite or access should be done by the underlying ObjectNode
	nextObjectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return nextObjectNode._patch( context.nextObjectNode( nextObjectNode , true , true ) ) ;
} ;



CollectionNode.prototype._delete = async function( context ) {
	var query , document , nextObjectNode ;

	if ( context.pathParts.length === 0 ) {
		throw ErrorStatus.badRequest( 'Cannot perform a DELETE on a collection node' ) ;
	}


	switch ( context.pathParts[ 0 ].type ) {
		case 'id' :
			if ( context.batchOf ) {
				if ( ! context.batchOf.some( element => element.toString() === context.pathParts[ 0 ].identifier ) ) {
					throw ErrorStatus.notFound( "ID '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
				}

				query = { _id: context.pathParts[ 0 ].identifier } ;
			}
			else {
				query = {
					_id: context.pathParts[ 0 ].identifier ,
					"parent.id": context.parentObjectNode.id
				} ;
			}

			break ;

		case 'slugId' :
			if ( context.batchOf ) {
				// /!\ Should be detected upstream (at path parsing), cause it costs resources for nothing /!\
				throw ErrorStatus.badRequest( "SlugId are not supported after a multi-link." ) ;
			}

			query = {
				slugId: context.pathParts[ 0 ].identifier ,
				"parent.id": context.parentObjectNode.id
			} ;

			break ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}


	// Process the child object
	document = await this.collection.getUnique( query ) ;

	// The resource exists, delete or access should be done by the underlying ObjectNode
	nextObjectNode = this.createObjectNode( document , [ context.parentObjectNode , ... context.parentObjectNode.ancestors ] , context.alter ) ;

	return nextObjectNode._delete( context.nextObjectNode( nextObjectNode , true , true ) ) ;
} ;



/*
	/!\ Security issue: querying can allow one to gather informations on unreadable properties /!\
	/!\ We should use the context.input.access to verify that filtered/sorted field are in the access /!\

	Operators that will be supported:
		- comparison: $in, $nin, $gt, $gte, $lt, $lte, $eq, $ne
		- misc: $exists
		- maybe evaluation: $regex, $text, $mod
*/

// Allowed operators
const ALLOWED_OPERATOR_FILTERS = new Set( [ '$in' , '$nin' , '$gt' , '$gte' , '$lt' , '$lte' , '$eq' , '$ne' , '$exists' ] ) ;

// Filters that apply to elements of an array instead of the targeted array
const ELEMENT_OPERATOR_FILTERS = new Set( [ '$in' , '$nin' ] ) ;

CollectionNode.prototype.checkQuery = async function( context ) {
	var hasDollar , hasNonDollar , key , innerKey , subSchema , outerSubSchema , innerSubSchema ,
		query = context.input.query ;

	if ( query.isChecked ) { return ; }

	// Enforce the limit
	if ( ! query.limit || query.limit > this.queryLimit ) { query.limit = this.queryLimit ; }

	if ( query.sort ) {
		for ( key in query.sort ) {
			if ( ! this.unindexedQueries && ! this.collection.indexedProperties[ key ] && ! this.collection.indexedLinks[ key ] ) {
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

			query.isSensible = true ;
			subSchema = outerSubSchema = innerSubSchema = doormen.path( this.collection.documentSchema , key ) ;

			if ( outerSubSchema.type === 'array' || outerSubSchema.type === 'multiLink' ) {
				// Here we kept the MongoDB behavior: when the target is an array, most of time we filter array's elements
				subSchema = innerSubSchema = outerSubSchema.of || {} ;
			}

			if ( ! this.unindexedQueries && ! this.collection.indexedProperties[ key ] && ! this.collection.indexedLinks[ key ] ) {
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
						else if ( innerKey === '$exists' ) {
							switch ( query.filter[ key ][ innerKey ] ) {
								case 'true' :
								case '1' :
								case true :
								case 1 :
									query.filter[ key ][ innerKey ] = true ;
									break ;
								default :
									query.filter[ key ][ innerKey ] = false ;
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
		query.isSensible = true ;

		if ( typeof query.search === 'number' ) {
			// Cast to a string
			query.search = '' + query.search ;
		}

		if ( ! query.filter ) { query.filter = {} ; }

		if ( this.hooks.search ) {
			// /!\ What should be the effect of context.isDone ???
			await restQuery.hooks.run( this.hooks.search , context ) ;

			// Should recover from userland code doing silly things like re-assigning context.query...
			query = context.input.query ;
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
	checkQueryAccess( context , element , ancestors )
	Query/list on the collection
*/
CollectionNode.prototype.checkQueryAccess = function( context ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'query' ,
		requiredAccess: true ,
		collectionNode: context.parentObjectNode.collectionNode ,
		forCollection: this.name ,
		object: context.parentObjectNode.object ,
		ancestors: context.parentObjectNode.ancestors
	} ) ;
} ;



/*
	checkBatchReadAccess( context , element , ancestors )
	That collection variant is executed on each element of a batch.
*/
CollectionNode.prototype.checkBatchReadAccess = async function( context , object , ancestors ) {
	var accessTags ;

	if ( context.input.access === 'all-granted' ) {
		accessTags = await restQuery.Node.getAllAccessTags( {
			performer: context.performer ,
			accessType: 'read' ,
			collectionNode: this ,
			object: object ,
			ancestors: ancestors
		} ) ;

		// So we have to change the document's tag masking...
		if ( accessTags === true ) {
			// Always remove the 'security' special tag
			accessTags = new Set( this.allTags ) ;
			accessTags.delete( 'security' ) ;
			object.setTagMask( accessTags ) ;
		}
		else if ( ! accessTags.size ) {
			if ( context.performer._unconnected() ) {
				throw ErrorStatus.unauthorized( "Public read forbidden." ) ;
			}
			else {
				throw ErrorStatus.forbidden( "Read forbidden." ) ;
			}
		}
		else {
			// Always remove the 'security' special tag
			accessTags.delete( 'security' ) ;
			object.setTagMask( accessTags ) ;
		}
	}
	else {
		await restQuery.Node.checkAccess( {
			performer: context.performer ,
			accessType: 'read' ,
			requiredAccess: context.input.access ,
			collectionNode: this ,
			object ,
			ancestors
		} ) ;
	}

	if ( context.input.query.populate || context.input.query.deepPopulate ) {
		if ( context.input.populateAccess === 'all-granted' ) {
			// Don't compute it twice if already done earlier!
			if ( ! accessTags ) {
				accessTags = await restQuery.Node.getAllAccessTags( {
					performer: context.performer ,
					accessType: 'read' ,
					collectionNode: this ,
					object: object ,
					ancestors: ancestors
				} ) ;
			}

			// So we have to change the document's *POPULATE* tag masking...
			if ( accessTags === true ) {
				// Always remove the 'security' special tag
				accessTags = new Set( this.allTags ) ;
				accessTags.delete( 'security' ) ;
				object.setPopulateTagMask( accessTags ) ;
			}
			else {
				// Always remove the 'security' special tag
				accessTags.delete( 'security' ) ;
				object.setPopulateTagMask( accessTags ) ;
			}
		}
		else {
			await restQuery.Node.checkAccess( {
				performer: context.performer ,
				accessType: 'read' ,
				requiredAccess: context.input.populateAccess ,
				collectionNode: this ,
				object ,
				ancestors
			} ) ;
		}
	}
} ;



/*
	checkCreateAccess( context )
*/
CollectionNode.prototype.checkCreateAccess = function( context ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'create' ,
		requiredAccess: true ,
		collectionNode: context.parentObjectNode.collectionNode ,
		forCollection: this.name ,
		object: context.parentObjectNode.object ,
		ancestors: context.parentObjectNode.ancestors
	} ) ;
} ;



/*
	checkExecAccess( context )
*/
CollectionNode.prototype.checkExecAccess = function( context , fnTags ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'exec' ,
		requiredAccess: fnTags ,
		requireOnlyOne: true ,
		collectionNode: context.parentObjectNode.collectionNode ,
		forCollection: this.name ,
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
		return Promise.reject( ErrorStatus.badRequest( "HTTP verb and method 'schema' are not compatible" ) ) ;
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

CollectionNode.prototype.schemaMethod.tags = [ 'schema' ] ;



CollectionNode.prototype.regenerateSlugMethod = async function( context ) {
	if ( context.input.method !== 'post' ) {
		return Promise.reject( ErrorStatus.badRequest( "HTTP verb and method 'regenerateSlug' are not compatible" ) ) ;
	}

	context.document.slugId = null ;
	this.generateSlug( context.document ) ;

	try {
		await context.document.save() ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.manageRetry( context.document , error , 'save' , undefined , { slug: true } ) ;
	}

	context.output.data = { slugId: context.document.slugId } ;
} ;

CollectionNode.prototype.regenerateSlugMethod.tags = [ 'regenerateSlug' ] ;



CollectionNode.prototype.regenerateHidMethod = async function( context ) {
	if ( context.input.method !== 'post' ) {
		return Promise.reject( ErrorStatus.badRequest( "HTTP verb and method 'regenerateHid' are not compatible" ) ) ;
	}

	context.document.hid = null ;
	this.generateHid( context.document ) ;

	try {
		await context.document.save() ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.manageRetry( context.document , error , 'save' , undefined , { hid: true } ) ;
	}

	context.output.data = { hid: context.document.hid } ;
} ;

CollectionNode.prototype.regenerateHidMethod.tags = [ 'regenerateHid' ] ;



/*
	Generate fake documents.

	POST body JSON properties (all are optionals):
	* count: the number of fake documents to generate (default: 1)
	* override: for each document, override with this object
*/
CollectionNode.prototype.generateFakeMethod = async function( context ) {
	if ( context.input.method !== 'post' ) {
		return Promise.reject( ErrorStatus.badRequest( "HTTP verb and method 'generateFake' are not compatible" ) ) ;
	}

	/*
	if ( ! this.collection.fakeDataGenerator ) {
		return Promise.reject( ErrorStatus.badRequest( "Collection '" + this.name + "' does not support fake data generation" ) ) ;
	}
	*/

	var count = context.input.document?.count !== undefined  ?  + context.input.document.count || 0  :  1  ;

	var batch = [] , idListByCollection = {} ;

	// Get some IDs for each collection to link to
	if ( this.fakeLinkGeneration ) {
		for ( let linkPath in this.fakeLinkGeneration ) {
			let linkParams = this.fakeLinkGeneration[ linkPath ] ;
			let linkSchema = doormen.subSchema( this.schema , linkPath ) ;
			let collectionName = linkSchema.collection ;
			let linkCollection = this.app.world.collections[ collectionName ] ;

			if (
				( linkSchema.type === 'link' || linkSchema.type === 'multiLink' )
				&& ! idListByCollection[ collectionName ]
				&& linkCollection
			) {
				idListByCollection[ collectionName ] = await linkCollection.findIdList( {} , { limit: linkParams.limit || 1000 , partial: true } ) ;
			}
		}
	}

	for ( let index = 0 ; index < count ; index ++ ) {
		let document = {} ;

		if ( context.input.document?.override && typeof context.input.document.override === 'object' ) {
			deepExtend( document , context.input.document.override ) ;
		}

		if ( this.fakeLinkGeneration ) {
			for ( let linkPath in this.fakeLinkGeneration ) {
				let linkParams = this.fakeLinkGeneration[ linkPath ] ;
				let linkSchema = doormen.subSchema( this.schema , linkPath ) ;
				let idList = idListByCollection[ linkSchema.collection ] ;

				if ( idList?.length ) {
					switch ( linkSchema.type ) {
						case 'link' :
							if ( typeof linkParams.chance !== 'number' || Math.random() < linkParams.chance ) {
								tree.dotPath.set(
									document ,
									linkPath ,
									arrayKit.randomElement( idList )
								) ;
							}
							break ;

						case 'multiLink' :
							tree.dotPath.set(
								document ,
								linkPath ,
								arrayKit.randomSampleSize( idList , linkParams.min || 0 , linkParams.max || 5 )
							) ;
							break ;
					}
				}
			}
		}

		document = this.collection.fakeAndValidate( document ) ;

		// Remove things that are automatically added by the Schema validator
		// /!\ IDEALLY we should have a method that only create fake data, but for instance Doormen does not allow it...
		if ( ! context.input.document.override?.slugId ) { delete document.slugId ; }
		if ( ! context.input.document.override?.hid ) { delete document.hid ; }

		batch.push( document ) ;
	}

	//log.hdebug( "batch: %Y" , batch ) ;
	await this.postDocumentBatch( context , batch ) ;
} ;

CollectionNode.prototype.generateFakeMethod.tags = [ 'generateFake' ] ;

