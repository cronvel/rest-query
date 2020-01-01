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
const Context = require( './Context.js' ) ;
const ErrorStatus = require( 'error-status' ) ;
const doormen = require( 'doormen' ) ;
const tree = require( 'tree-kit' ) ;
const rootsDb = require( 'roots-db' ) ;
const restQuery = require( './restQuery.js' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* Object Node */



function ObjectNode( app , collectionNode , object , ancestors , alter ) {
	var id , autoCollection , methods , alterSchema ;

	if ( collectionNode ) {
		restQuery.Node.call( this , app , collectionNode.children ) ;
		autoCollection = collectionNode.autoCollection ;
		methods = collectionNode.objectMethods ;

		if ( collectionNode.isRoot ) {
			// We are creating the root node
			// important, we check the root parent ancestry with parent.id = '/'
			id = '/' ;
		}
		else if ( object ) {
			if ( typeof object.getId === 'function' ) { id = object.getId() ; }
			else { id = null ; }
		}
		else {
			id = null ;
		}
	}

	alterSchema = ( alter && alter.schema && alter.schema[ collectionNode.name ] ) || null ;

	this.collectionNode = collectionNode ;
	this.autoCollection = autoCollection ;
	this.object = object ;
	this.id = id ;
	this.alterSchema = alterSchema ;
	this.methods = methods ;
	this.ancestors = ancestors || [] ;
}

module.exports = ObjectNode ;

ObjectNode.prototype = Object.create( restQuery.Node.prototype ) ;
ObjectNode.prototype.constructor = ObjectNode ;



// Useful for common Node superclass methods
ObjectNode.prototype.isObjectNode = true ;



// A wrapper for custom methods
ObjectNode.prototype.userMethodWrapper = async function( methodName , context ) {
	if ( ! this.methods[ methodName ] ) {
		return Promise.reject( ErrorStatus.notFound( "Method '" + methodName + "' not found." ) ) ;
	}

	await this.checkExecAccess( context , this.methods[ methodName ].tags ) ;

	// Reset output serializer, if any
	context.output.serializer = null ;
	context.output.serializerOptions = null ;

	// incomingDocument is inside context.input.document and attachmentStreams in context.input.attachmentStreams
	context.remainingPathParts = context.pathParts ;
	context.collectionNode = this.collectionNode ;
	context.objectNode = this ;

	// Init the driver before calling the method, because the method could use direct driver access
	if ( ! this.collectionNode.collection.driver.raw ) {
		await this.collectionNode.collection.driver.rawInit() ;
	}

	var response = await this.methods[ methodName ].call( this , context ) ;
	if ( response !== undefined ) { context.output.data = response ; }

	return context ;
} ;



ObjectNode.prototype._get = async function( context ) {
	//log.hdebug( "ObjectNode#_get() pathParts: %Y" , context.pathParts ) ;
	var nextPath , nextCollection , nextCollectionNode , nextObjectNode , linkDetails , document , readStream ;

	this.alteration( context ) ;

	if ( context.pathParts.length === 0 || ( context.pathParts.length === 1 && context.pathParts[ 0 ].type === 'property' ) ) {
		// Get that object!

		// Check access
		await this.checkReadAccess( context ) ;

		context.output.serializer = restQuery.serializers.toJsonLocalEnumerate ;
		context.output.serializerOptions = null ;
		// already automatically defined:
		//context.document = this.object ;
		context.output.data = context.pathParts.length ? tree.dotPath.get( this.object , context.pathParts[ 0 ].identifier ) : this.object ;
		return context ;
	}


	// Object's methods (executing a method of the object is not traversing it)
	if ( context.pathParts[ 0 ].type === 'method' ) {
		return this.userMethodWrapper( context.pathParts[ 0 ].identifier , context ) ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( context.pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ context.pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextCollection = context.pathParts[ 0 ].identifier ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._get( context.nextCollectionNode( nextCollectionNode , true ) ) ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			// Do not advance path part
			nextCollection = this.autoCollection ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._get( context.nextCollectionNode( nextCollectionNode ) ) ;

		case 'linkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } , true ) ;

			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, send back the readable stream, with its meta-data
				readStream = await document.getReadStream() ;
				context.output.meta = document ;
				context.output.data = readStream ;
				return context ;
			}

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			/* --ctx
			return nextObjectNode._get(
				pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;
			*/

			return nextObjectNode._get( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			/* --ctx
			return this.app.collectionNodes[ linkDetails.foreignCollection ]._get(
				pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				} ,
			) ;
			*/

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._get( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found [ObjectNode]." ) ;
	}


	/* --ctx
	// Process the child collection
	return this.children[ nextCollection ]._get(
		nextPath ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			parentObjectNode: this
		}
	) ;
	*/
} ;



ObjectNode.prototype._post = async function( context ) {
	var nextPath , nextCollection , nextCollectionNode , nextObjectNode , linkDetails , document ;

	this.alteration( context ) ;

	if ( context.pathParts.length === 0 || ( context.pathParts.length === 1 && context.pathParts[ 0 ].type === 'property' ) ) {
		throw ErrorStatus.badRequest( 'Cannot perform a POST on an object node or property node' ) ;
	}


	// Object's methods (executing a method of the object is not traversing it)
	if ( context.pathParts[ 0 ].type === 'method' ) {
		return this.userMethodWrapper( context.pathParts[ 0 ].identifier , context ) ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( context.pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ context.pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextCollection = context.pathParts[ 0 ].identifier ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._post( context.nextCollectionNode( nextCollectionNode , true ) ) ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			// Do not advance path part
			nextCollection = this.autoCollection ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._post( context.nextCollectionNode( nextCollectionNode ) ) ;

		case 'linkProperty' :
			// We cannot really use the CollectionNode#post(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } ) ;

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a POST on/through an Attachment.' ) ;
			}
			*/

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			/* --ctx
			return nextObjectNode._post(
				context.pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;
			*/

			return nextObjectNode._post( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			/* --ctx
			return this.app.collectionNodes[ linkDetails.foreignCollection ]._post(
				context.pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: context.pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;
			*/

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._post( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}

	/* --ctx
	// Process the child collection
	return this.children[ nextCollection ]._post(
		nextPath ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			parentObjectNode: this
		}
	) ;
	*/
} ;



// If this method is called, it means that the object *EXISTS*,
// PUT on an unexistant object is performed at collection-level.
ObjectNode.prototype._put = async function( context ) {
	var nextPath , nextCollection , nextCollectionNode , nextObjectNode , patch , linkDetails , document ,
		incomingDocument = context.input.document ;

	this.alteration( context ) ;

	if ( context.pathParts.length === 0 ) {
		// If we are here, we are about to REPLACE an existing object

		if ( this.collectionNode.isRoot ) {
			throw ErrorStatus.badRequest( "Cannot PUT / (use PATCH instead)" ) ;
		}

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a PUT request, replacing a whole document, should be a strict Object." ) ;
		}

		// Check access
		await this.checkOverwriteAccess( context ) ;
		return this.putOverwriteDocument( context ) ;
	}

	// The next and final node is a property node, transform that into a PATCH request
	if ( context.pathParts.length === 1 && context.pathParts[ 0 ].type === 'property' ) {
		context.patch = {} ;
		context.patch[ context.pathParts[ 0 ].identifier ] = incomingDocument ;
		/* --ctx
		return this._patch( [] , patch , attachmentStreams , context ) ;
		*/
		return this._patch( context.nextPart() ) ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( context.pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ context.pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextCollection = context.pathParts[ 0 ].identifier ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._put( context.nextCollectionNode( nextCollectionNode , true ) ) ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			// Do not advance path part
			nextCollection = this.autoCollection ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._put( context.nextCollectionNode( nextCollectionNode ) ) ;

		case 'linkProperty' :
			// If there is only one part left, then it's a putLink request
			if ( context.pathParts.length === 1 ) {
				return this.putLink( context ) ;
			}

			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } ) ;

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a PUT on/through an Attachment.' ) ;
			}
			*/

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

			/* --ctx
			return objectNode._put(
				incomingDocument ,
				attachmentStreams ,
				context.pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;
			*/

			return nextObjectNode._put( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			/*
			return this.app.collectionNodes[ linkDetails.foreignCollection ]._put(
				context.pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: context.pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;
			*/

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._put( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}

	/* --ctx
	// Process the child collection
	return this.children[ nextCollection ]._put(
		nextPath ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			parentObjectNode: this
		}
	) ;
	*/
} ;



ObjectNode.prototype.putOverwriteDocument = async function( context ) {
	var id , document , incomingDocument ;
	
	incomingDocument = context.incomingDocument = context.input.document ;
	context.existingDocument = this.object ;

	// Create the ID for incomingDocument with the existing document
	id = this.collectionNode.collection.setId( incomingDocument , this.id ) ;

	incomingDocument.parent = {
		collection: this.ancestors[ 0 ].collectionNode && this.ancestors[ 0 ].collectionNode.name ,
		id: this.ancestors[ 0 ].id
	} ;

	// If no slug is provided, keep the current slug
	if ( ! incomingDocument.slugId ) { incomingDocument.slugId = this.object.slugId ; }

	if ( this.collectionNode.beforeCreateHook ) { await this.collectionNode.beforeCreateHook( context ) ; }

	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		document = context.document = this.collectionNode.collection.createDocument( incomingDocument ) ;

		// We are replacing an object, so we need to clear attachments first
		await document.save( { overwrite: true , clearAttachments: true , attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	context.output.httpStatus = 200 ;

	// 'this' is now obsolete as the object node
	context.objectNode = this.collectionNode.createObjectNode( document , [ this , ... this.ancestors ] , context.alter ) ;
	context.deletedDocument = this.object ;
	context.output.data = { id: id } ;

	if ( this.collectionNode.afterCreateHook ) {
		try {
			await this.collectionNode.afterCreateHook( context ) ;
		}
		catch ( error ) {
			log.error( "The 'afterCreateHook' failed, but the request had already succeeded: %E" , error ) ;
			// Send 200 anyway?
			return context ;
		}
	}

	return context ;
} ;



ObjectNode.prototype.putLink = async function( context ) {
	var document , nextCollectionNode , nextObjectNode , details , incomingDocument ;
	
	incomingDocument = context.incomingDocument = context.input.document ;

	// We cannot really use the CollectionNode#put(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.

	try {
		document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } , true ) ;
	}
	catch ( error ) {
		if ( error.type === 'notFound' && context.pathParts.length === 1 ) {
			// This is a normal case: the target does not exist yet,
			// and should be created by the request

			details = this.object.getLinkDetails( context.pathParts[ 0 ].identifier , true ) ;

			if ( details.type === 'attachment' ) {
				try {
					await this.object.commit( { attachmentStreams: context.input.attachmentStreams } ) ;
				}
				catch ( error_ ) {
					throw this.transformError( error_ ) ;
				}

				return context ;
			}

			if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
				throw ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ;
			}

			//collection = this.app.collectionNodes[ details.foreignCollection ].collection ;

			await this.checkCreateLinkAccess( context , context.pathParts[ 0 ].identifier ) ;
			context.targetCollectionNode = this.app.collectionNodes[ details.foreignCollection ] ;
			return this.putNewLinkedDocument( context ) ;
		}

		throw error ;
	}

	if ( document instanceof rootsDb.Attachment ) {
		try {
			await this.object.commit( { attachmentStreams: context.input.attachmentStreams } ) ;
		}
		catch ( error ) {
			throw this.transformError( error ) ;
		}

		return context ;
	}

	nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

	// we instanciate an objectNode to query
	nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

	/* --ctx
	return nextObjectNode._put(
		context.pathParts.slice( 1 ) ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: {}
		}
	) ;
	*/

	return nextObjectNode._put( context.nextObjectNode( nextObjectNode , true , false ) ) ;
} ;



ObjectNode.prototype.putNewLinkedDocument = async function( context ) {
	var id , document , incomingDocument ;

	incomingDocument = context.incomingDocument = context.input.document ;

// /!\ Use .linker instead of .linkerObjectNode ?
	context.linkerObjectNode = this ;

	incomingDocument.parent = {
		collection: 'root' ,
		id: '/'
	} ;

	// Create the ID
	id = this.collectionNode.collection.setId( incomingDocument ) ;

	if ( context.targetCollectionNode.beforeCreateHook ) { await context.targetCollectionNode.beforeCreateHook( context ) ; }

	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		document = context.document = context.targetCollectionNode.collection.createDocument( incomingDocument ) ;
		await document.save() ;

		// /!\ What about Attachment?
		this.object.setLink( context.pathParts[ 0 ].identifier , document ) ;
		await this.object.commit() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	context.output.httpStatus = 201 ;
	context.objectNode = this.collectionNode.createObjectNode( document , [ this.app.root ] ) ;

	context.output.data = {
		id: id ,
		slugId: document.slugId
	} ;

	if ( this.collectionNode.afterCreateHook ) {
		try {
			await this.collectionNode.afterCreateHook( context ) ;
		}
		catch ( error ) {
			log.error( "The 'afterCreateHook' failed, but the request had already succeeded: %E" , error ) ;
			// Send 201 anyway?
			return context ;
		}
	}

	return context ;
} ;



ObjectNode.prototype._patch = async function( context ) {
	var nextCollection , nextCollectionNode , nextObjectNode , linkDetails , patch , document ,
		incomingPatch = context.patch || context.input.document ;

	this.alteration( context ) ;

	if ( context.pathParts.length === 0 || ( context.pathParts.length === 1 && context.pathParts[ 0 ].type === 'property' ) ) {
		// Patch that object!
		if ( ! incomingPatch || typeof incomingPatch !== 'object' || Array.isArray( incomingPatch ) ) {
			throw ErrorStatus.badRequest( "The body of a PATCH request should be a strict Object." ) ;
		}

		// Prefix the patch, if needed...
		patch = context.patch = context.pathParts.length ?
			restQuery.Node.prefixPatchDocument( incomingPatch , context.pathParts[ 0 ].identifier ) :
			incomingPatch ;

		// Check access
		await this.checkPatchWriteAccess( context , patch ) ;
		return this.patchDocument( context ) ;
	}

	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( context.pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ context.pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextCollection = context.pathParts[ 0 ].identifier ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._patch( context.nextCollectionNode( nextCollectionNode , true ) ) ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			// Do not advance path part
			nextCollection = this.autoCollection ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._patch( context.nextCollectionNode( nextCollectionNode ) ) ;

		case 'linkProperty' :
			// If there is only one part left, then it's a putLink request
			if ( context.pathParts.length === 1 ) {
				return this.patchLink( context ) ;
			}

			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } ) ;

			// Not possible, .getLink() called without the 'acceptAttachment' option
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a PATCH on/through an Attachment.' ) ;
				return ;
			}
			*/

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;
			
			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			/* --ctx
			return objectNode._patch(
				context.pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;
			*/

			return nextObjectNode._patch( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			/* --ctx
			return this.app.collectionNodes[ linkDetails.foreignCollection ]._patch(
				context.pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: context.pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;
			*/

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._patch( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}

	/*
	// Process the child collection
	return this.children[ nextCollection ]._patch(
		nextPath ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			parentObjectNode: this
		}
	) ;
	*/
} ;



ObjectNode.prototype.patchDocument = async function( context ) {
	var patch = context.patch || context.input.document ;	// IMPORTANT!

	context.patch = context.incomingPatch = patch ;
	context.existingDocument = this.object ;

	// Do not modify the parent in a PATCH request
	this.collectionNode.collection.deleteId( patch ) ;
	delete patch.parent ;
	delete patch['parent.id'] ;
	delete patch['parent.collection'] ;

	if ( this.collectionNode.beforeModifyHook ) { await this.collectionNode.beforeModifyHook( context ) ; }

	try {
		this.collectionNode.initPatch( patch ) ;
		this.collectionNode.checkAlterSchema( patch , context , true ) ;
		this.object.patch( patch , { validate: true } ) ;
		await this.object.commit( { attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	if ( this.collectionNode.afterModifyHook ) {
		try {
			await this.collectionNode.afterModifyHook( context ) ;
		}
		catch ( error ) {
			log.error( "The 'afterModifyHook' failed, but the request had already succeeded: %E" , error ) ;
			// Send 200 anyway?
			return context ;
		}
	}

	return context ;
} ;



ObjectNode.prototype.patchLink = async function( context ) {
	var document , nextCollectionNode , nextObjectNode ;

	// We cannot really use the CollectionNode#patch(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } ) ;

	// Not possible, .getLink() called without the 'acceptAttachment' option
	/*
	if ( document instanceof rootsDb.Attachment ) {
		// It's an attachment, it cannot be patched
		throw ErrorStatus.badRequest( 'Cannot perform a PATCH on/through an Attachment.' ) ;
	}
	*/

	nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;
	
	// we instanciate an objectNode to query
	nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

	/* --ctx
	return objectNode._patch(
		context.pathParts.slice( 1 ) ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: {}
		}
	) ;
	*/

	return nextObjectNode._patch( context.nextObjectNode( nextObjectNode , true , false ) ) ;
} ;



ObjectNode.prototype._delete = async function( context ) {
	var nextPath , nextCollection , nextCollectionNode , nextObjectNode , patch , linkDetails , document ;

	this.alteration( context ) ;

	if ( context.pathParts.length === 0 ) {
		// If we are here, we are about to DELETE an existing object
		if ( this.collectionNode.isRoot ) {
			throw ErrorStatus.badRequest( "Cannot DELETE /" ) ;
		}

		// Check access
		await this.checkDeleteAccess( context ) ;
		return this.deleteDocument( context ) ;
	}

	// The next and final node is a property node, transform that into a PATCH request
	if ( context.pathParts.length === 1 && context.pathParts[ 0 ].type === 'property' ) {
		context.patch = {} ;
		context.patch[ context.pathParts[ 0 ].identifier ] = undefined ;
		/* --ctx
		return this._patch( [] , patch , null , context ) ;
		*/
		return this._patch( context.nextPart() ) ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( context.pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ context.pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + context.pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextCollection = context.pathParts[ 0 ].identifier ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._delete( context.nextCollectionNode( nextCollectionNode , true ) ) ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			// Do not advance path part
			nextCollection = this.autoCollection ;
			nextCollectionNode = this.children[ nextCollection ] ;
			return nextCollectionNode._delete( context.nextCollectionNode( nextCollectionNode ) ) ;

		case 'linkProperty' :
			// If there is only one part left, then it's a deleteLink request
			if ( context.pathParts.length === 1 ) {
				return this.deleteLink( context ) ;
			}

			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } ) ;

			// Not possible, .getLink() called without the 'acceptAttachment' option
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a DELETE on/through an Attachment.' ) ;
			}
			*/

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;
			
			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			/* --ctx
			return objectNode._delete(
				context.pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;
			*/

			return nextObjectNode._delete( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			/* --ctx
			return this.app.collectionNodes[ linkDetails.foreignCollection ]._delete(
				context.pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: context.pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;
			*/

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._delete( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}


	/* --ctx
	// Process the child collection
	return this.children[ nextCollection ]._delete(
		nextPath ,
		{
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			parentObjectNode: this
		}
	) ;
	*/
} ;



ObjectNode.prototype.deleteDocument = async function( context ) {
	var idStr ;

	context.existingDocument = this.object ;

	if ( this.collectionNode.beforeDeleteHook ) { await this.collectionNode.beforeDeleteHook( context ) ; }

	// /!\ Should delete all children too!!! /!\

	try {
		await this.object.delete() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	context.deletedDocument = this.object ;
	
	if ( context.batchOf ) {
		context.linker.object.removeLink( context.linkerPath , this.object ) ;

		try {
			await context.linker.object.commit() ;
		}
		catch ( error ) {
			log.error( "The Object's commit failed, but the request had already succeeded: %E" , error ) ;
			// Send 200 anyway?
			return context ;
		}
	}

	if ( this.collectionNode.afterDeleteHook ) {
		try {
			await this.collectionNode.afterDeleteHook( context ) ;
		}
		catch ( error ) {
			log.error( "The 'afterDeleteHook' failed, but the request had already succeeded: %E" , error ) ;
			// Send 200 anyway?
			return context ;
		}
	}

	return context ;
} ;



// Unlink and delete the target
// /!\ Obsolete? Replace it by deleteDocument()? (deleteDocument() is already used for deleting a link from a multi-link).
ObjectNode.prototype.deleteLink = async function( context ) {
	var document , nextCollectionNode , nextObjectNode ;

	// We cannot really use the CollectionNode#delete(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } , true ) ;

	if ( document instanceof rootsDb.Attachment ) {
		// It's an attachment, delete it's meta-data property
		// This will delete the file on HD

		try {
			await this.object.removeAttachment( context.pathParts[ 0 ].identifier ) ;
			await this.object.commit() ;
		}
		catch ( error ) {
			throw this.transformError( error ) ;
		}

		return context ;
	}

	// /!\ Should we add an unlink hook?

	try {
		this.object.removeLink( context.pathParts[ 0 ].identifier ) ;
		await this.object.commit() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;
	
	// we instanciate an objectNode to query
	nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

	/*
	return objectNode._delete(
		context.pathParts.slice( 1 ) ,
		{
			input: context.input ,
			output: context.output ,
			alter: {}
		}
	) ;
	*/

	return nextObjectNode._delete( context.linkToObjectNode( nextObjectNode , true ) ) ;
} ;



/*
	checkTraverseAccess( context )
*/
ObjectNode.prototype.checkTraverseAccess = function( context ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'traverse' ,
		requiredAccess: true ,
		collectionNode: this.collectionNode ,
		object: this.object ,
		ancestors: this.ancestors
	} ) ;
} ;



/*
	checkReadAccess( context )
*/
ObjectNode.prototype.checkReadAccess = async function( context ) {
	var accessTags ;

	if ( context.input.access === 'all-granted' ) {
		accessTags = await restQuery.Node.getAllAccessTags( {
			performer: context.performer ,
			accessType: 'read' ,
			collectionNode: this.collectionNode ,
			object: this.object ,
			ancestors: this.ancestors
		} ) ;

		// So we have to change the document tag masking...
		if ( accessTags === true ) {
			// Always remove the 'security' special tag
			accessTags = new Set( this.collectionNode.allTags ) ;
			accessTags.delete( 'security' ) ;
			this.object.setTagMask( accessTags ) ;
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
			this.object.setTagMask( accessTags ) ;
		}
	}
	else {
		await restQuery.Node.checkAccess( {
			performer: context.performer ,
			accessType: 'read' ,
			requiredAccess: context.input.access ,
			collectionNode: this.collectionNode ,
			object: this.object ,
			ancestors: this.ancestors
		} ) ;
	}

	if ( context.input.query.populate ) {
		if ( context.input.populateAccess === 'all-granted' ) {
			// Don't compute it twice if already done earlier!
			if ( ! accessTags ) {
				accessTags = await restQuery.Node.getAllAccessTags( {
					performer: context.performer ,
					accessType: 'read' ,
					collectionNode: this.collectionNode ,
					object: this.object ,
					ancestors: this.ancestors
				} ) ;
			}

			// So we have to change the document's *POPULATE* tag masking...
			if ( accessTags === true ) {
				// Always remove the 'security' special tag
				accessTags = new Set( this.collectionNode.allTags ) ;
				accessTags.delete( 'security' ) ;
				this.object.setPopulateTagMask( accessTags ) ;
			}
			else {
				// Always remove the 'security' special tag
				accessTags.delete( 'security' ) ;
				this.object.setPopulateTagMask( accessTags ) ;
			}
		}
		else {
			await restQuery.Node.checkAccess( {
				performer: context.performer ,
				accessType: 'read' ,
				requiredAccess: context.input.populateAccess ,
				collectionNode: this.collectionNode ,
				object: this.object ,
				ancestors: this.ancestors
			} ) ;
		}
	}
} ;



/*
	checkOverwriteAccess( context )
*/
ObjectNode.prototype.checkOverwriteAccess = function( context ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'overwrite' ,
		requiredAccess: true ,
		collectionNode: this.collectionNode ,
		object: this.object ,
		ancestors: this.ancestors
	} ) ;
} ;



/*
	checkPatchWriteAccess( context , patchDocument )
	Get all access tag of the user check the patch with it.
*/
ObjectNode.prototype.checkPatchWriteAccess = async function( context , patchDocument ) {
	var accessTags = await restQuery.Node.getAllAccessTags( {
		performer: context.performer ,
		accessType: 'write' ,
		collectionNode: this.collectionNode ,
		object: this.object ,
		ancestors: this.ancestors
	} ) ;

	if ( accessTags === true ) { return ; }

	if ( ! accessTags.size ) {
		if ( context.performer._unconnected() ) {
			throw ErrorStatus.unauthorized( "Public patch forbidden." ) ;
		}
		else {
			throw ErrorStatus.forbidden( "Patch forbidden." ) ;
		}
	}

	try {
		doormen.checkPatchByTags( this.collectionNode.collection.documentSchema , patchDocument , accessTags ) ;
	}
	catch ( error ) {
		if ( context.performer._unconnected() ) {
			throw ErrorStatus.unauthorized( "Public patch including forbidden properties." ) ;
		}
		else {
			throw ErrorStatus.forbidden( "Patch including forbidden properties." ) ;
		}
	}
} ;



/*
	checkCreateLinkAccess( context )
*/
ObjectNode.prototype.checkCreateLinkAccess = function( context , path ) {
	var tags ;

	try {
		tags = doormen.path( this.collectionNode.collection.documentSchema , path ).tags || [ 'content' ] ;
	}
	catch ( error ) {
		return Promise.reject( ErrorStatus.badRequest( error ) ) ;
	}

	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'write' ,
		requiredAccess: tags ,
		collectionNode: this.collectionNode ,
		object: this.object ,
		ancestors: this.ancestors
	} ).then( () => restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'create' ,
		requiredAccess: true ,
		collectionNode: null ,
		object: this.app.root.object ,
		ancestors: this.app.root.ancestors
	} ) ) ;
} ;



/*
	checkDeleteAccess( context )
*/
ObjectNode.prototype.checkDeleteAccess = function( context ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'delete' ,
		requiredAccess: true ,
		collectionNode: this.collectionNode ,
		object: this.object ,
		ancestors: this.ancestors
	} ) ;
} ;



/*
	checkExecAccess( context )
*/
ObjectNode.prototype.checkExecAccess = function( context , fnTags ) {
	return restQuery.Node.checkAccess( {
		performer: context.performer ,
		accessType: 'exec' ,
		requiredAccess: fnTags ,
		requireOnlyOne: true ,
		collectionNode: this.collectionNode ,
		object: this.object ,
		ancestors: this.ancestors
	} ) ;
} ;



/*
	alteration( context )
*/
ObjectNode.prototype.alteration = function( context ) {
	var alterSchemaList , keys ;

	if ( ! this.collectionNode ||
		! this.collectionNode.alterSchemaProperty ||
		! this.object[ this.collectionNode.alterSchemaProperty ] ||
		typeof this.object[ this.collectionNode.alterSchemaProperty ] !== 'object'
	) {
		return ;
	}

	alterSchemaList = this.object[ this.collectionNode.alterSchemaProperty ] ;

	keys = Object.keys( alterSchemaList ) ;
	if ( ! keys.length ) { return ; }
	if ( ! context.alter.schema ) { context.alter.schema = {} ; }

	keys.forEach( k => context.alter.schema[ k ] = alterSchemaList[ k ] ) ;
} ;

