/*
	Rest Query

	Copyright (c) 2014 - 2018 Cédric Ronvel

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

const tree = require( 'tree-kit' ) ;
const ErrorStatus = require( 'error-status' ) ;
const rootsDb = require( 'roots-db' ) ;
const doormen = require( 'doormen' ) ;

const restQuery = require( './restQuery.js' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;



/* Object Node */



function ObjectNode( app , collectionNode , object , ancestors , alter ) {
	var id , autoCollection , methods , alterSchema ;

	if ( collectionNode ) {
		restQuery.Node.call( this , app , collectionNode.children ) ;
		autoCollection = collectionNode.autoCollection ;
		methods = collectionNode.objectMethods ;

		if ( object ) {
			if ( typeof object.getId === 'function' ) { id = object.getId() ; }
			else { id = null ; }
		}
		else {
			id = null ;
		}
	}
	else {
		// If no collection, we are creating the root node
		restQuery.Node.call( this , app ) ;
		id = '/' ;
		collectionNode = null ;
		autoCollection = app.rootAutoCollection ;
		methods = app.rootMethods ;
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



// A wrapper for custom methods
ObjectNode.prototype.userMethodWrapper = function( methodName , pathParts , incomingDocument , attachmentStreams , context ) {
	if ( ! this.methods[ methodName ] ) {
		return Promise.reject( ErrorStatus.notFound( "Method '" + methodName + "' not found." ) ) ;
	}

	// Reset output serializer, if any
	context.output.serializer = null ;
	context.output.serializerOpt1 = null ;
	context.output.serializerOpt2 = null ;
	
	// Still useful?
	context.collectionNode = this.collectionNode ;
	context.objectNode = this.objectNode ;

	return this.methods[ methodName ].call( this , pathParts , incomingDocument , attachmentStreams , context )
		.then( responseContext => responseContext || context ) ;
} ;



ObjectNode.prototype._get = async function( pathParts , context ) {
	var nextPath , nextCollection , linkDetails , document , readStream , afterContext ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) ) {
		// Get that object!

		// Check access
		await this.checkReadAccess( context ) ;

		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			document: this.object ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		afterContext.output.data = pathParts.length ? tree.path.get( this.object , pathParts[ 0 ].identifier ) : this.object ;
		return afterContext ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextPath = pathParts.slice( 1 ) ;
			nextCollection = pathParts[ 0 ].identifier ;
			break ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			nextPath = pathParts ;
			nextCollection = this.autoCollection ;
			break ;

		case 'linkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } , true ) ;

			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, send back the readable stream, with its meta-data
				readStream = await document.getReadStream ;

				context.output.meta = document ;

				afterContext =  {
					input: context.input ,
					output: context.output ,
					alter: context.alter ,
					document: this.object ,
					collectionNode: this.collectionNode ,
					objectNode: this
				} ;

				afterContext.output.data = readStream ;

				return afterContext ;
			}

			var collection = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

			return objectNode._get(
				pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;

		case 'multiLinkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

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

		case 'method' :
			return this.userMethodWrapper( pathParts[ 0 ].identifier , pathParts , null , null , context ) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


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
} ;



ObjectNode.prototype._post = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var nextPath , nextCollection , linkDetails , document ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) ) {
		throw ErrorStatus.badRequest( 'Cannot perform a POST on an object node or property node' ) ;
	}

	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextPath = pathParts.slice( 1 ) ;
			nextCollection = pathParts[ 0 ].identifier ;
			break ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			nextPath = pathParts ;
			nextCollection = this.autoCollection ;
			break ;

		case 'linkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#post(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } ) ;

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a POST on/through an Attachment.' ) ;
			}
			*/

			var collection = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

			return objectNode._post(
				pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;

		case 'multiLinkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			return this.app.collectionNodes[ linkDetails.foreignCollection ]._post(
				pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;

		case 'method' :
			return this.userMethodWrapper( pathParts[ 0 ].identifier , pathParts , incomingDocument , attachmentStreams , context ) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


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
} ;



// If this method is called, it means that the object *EXISTS*,
// PUT on an unexistant object is performed at collection-level.
ObjectNode.prototype._put = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var nextPath , nextCollection , documentPatch , linkDetails , document ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 ) {
		// If we are here, we are about to REPLACE an existing object

		if ( ! this.collectionNode ) {
			throw ErrorStatus.forbidden( "Cannot PUT into a static node." ) ;
		}

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a PUT request, replacing a whole document, should be a strict Object." ) ;
		}

		// Check access
		await this.checkReplaceWriteAccess( context ) ;
		return this.putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context ) ;
	}

	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) {
		documentPatch = {} ;
		documentPatch[ pathParts[ 0 ].identifier ] = incomingDocument ;
		return this._patch( [] , documentPatch , attachmentStreams , context ) ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextPath = pathParts.slice( 1 ) ;
			nextCollection = pathParts[ 0 ].identifier ;
			break ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			nextPath = pathParts ;
			nextCollection = this.autoCollection ;
			break ;

		case 'linkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No link property on a static node.' ) ;
			}

			// If there is only one part left, then it's a putLink request
			if ( pathParts.length === 1 ) {
				return this.putLink( pathParts , incomingDocument , attachmentStreams , context ) ;
			}

			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } ) ;

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a PUT on/through an Attachment.' ) ;
			}
			*/

			var collection = this.app.collectionNodes[ document._.collection.name ] ;
			// we instanciate an objectNode to query
			var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

			return objectNode._put(
				incomingDocument ,
				attachmentStreams ,
				pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;

		case 'multiLinkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			return this.app.collectionNodes[ linkDetails.foreignCollection ]._put(
				pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


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
} ;



ObjectNode.prototype.putOverwriteDocument = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var id , beforeContext , afterContext ;

	// Create the ID for incomingDocument with the existing document
	id = this.collectionNode.collection.setId( incomingDocument , this.id ) ;

	incomingDocument.parent = {
		collection: this.ancestors[ 0 ].collectionNode && this.ancestors[ 0 ].collectionNode.name ,
		id: this.ancestors[ 0 ].id
	} ;

	// If no slug is provided, keep the current slug
	if ( ! incomingDocument.slugId ) { incomingDocument.slugId = this.object.slugId ; }

	if ( this.collectionNode.beforeCreateHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			existingDocument: this.object ,
			incomingDocument: incomingDocument ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		await this.collectionNode.beforeCreateHook( beforeContext ) ;
	}

	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		incomingDocument = this.collectionNode.collection.createDocument( incomingDocument ) ;

		// We are replacing an object, so we need to clear attachments first
		await incomingDocument.save( { overwrite: true , clearAttachments: true , attachmentStreams: attachmentStreams } ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	context.output.httpStatus = 200 ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		deletedDocument: this.object ,
		document: incomingDocument ,
		collectionNode: this.collectionNode ,

		// 'this' is now obsolete as the object node
		objectNode: this.collectionNode.createObjectNode( incomingDocument , [ this ].concat( this.ancestors ) , context.alter )
	} ;

	if ( this.collectionNode.afterCreateHook ) {
		try {
			await this.collectionNode.afterCreateHook( afterContext ) ;
		}
		catch ( error ) {
			// Send 200 anyway?
			return afterContext ;
		}
	}

	return afterContext ;
} ;



ObjectNode.prototype.putLink = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var afterContext , document , collection , objectNode , details ;

	// We cannot really use the CollectionNode#put(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.

	try {
		document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } , true ) ;
	}
	catch ( error ) {
		if ( error.type === 'notFound' && pathParts.length === 1 ) {
			// This is a normal case: the target does not exist yet,
			// and should be created by the request

			details = this.object.getLinkDetails( pathParts[ 0 ].identifier , true ) ;

			if ( details.type === 'attachment' ) {
				try {
					await this.object.commit( { attachmentStreams: attachmentStreams } ) ;
				}
				catch ( error_ ) {
					throw this.transformError( error_ ) ;
				}

				afterContext = {
					input: context.input ,
					output: context.output ,
					alter: context.alter ,
					document: this.object ,
					collectionNode: this.collectionNode ,
					objectNode: this
				} ;

				return afterContext ;
			}

			if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
				throw ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ;
			}

			//collection = this.app.collectionNodes[ details.foreignCollection ].collection ;

			await this.checkCreateLinkAccess( context , pathParts[ 0 ].identifier ) ;
			context.targetCollectionNode = this.app.collectionNodes[ details.foreignCollection ] ;
			return this.putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context ) ;
		}

		throw error ;
	}

	if ( document instanceof rootsDb.Attachment ) {
		try {
			await this.object.commit( { attachmentStreams: attachmentStreams } ) ;
		}
		catch ( error ) {
			throw this.transformError( error ) ;
		}

		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			document: this.object ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		return afterContext ;
	}

	collection = this.app.collectionNodes[ document._.collection.name ] ;

	// we instanciate an objectNode to query
	objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

	return objectNode._put(
		pathParts.slice( 1 ) ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: {}
		}
	) ;
} ;



ObjectNode.prototype.putNewLinkedDocument = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var beforeContext , afterContext , id ;

	incomingDocument.parent = {
		collection: null ,
		id: '/'
	} ;

	// Create the ID
	id = this.collectionNode.collection.setId( incomingDocument ) ;

	if ( context.targetCollectionNode.beforeCreateHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			incomingDocument: incomingDocument ,
			collectionNode: this.collectionNode ,
			linkerObjectNode: this
		} ;

		await context.targetCollectionNode.beforeCreateHook( beforeContext ) ;
	}

	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		incomingDocument = context.targetCollectionNode.collection.createDocument( incomingDocument ) ;
		await incomingDocument.save() ;

		// /!\ What about Attachment?
		this.object.setLink( pathParts[ 0 ].identifier , incomingDocument ) ;
		await this.object.commit() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	context.output.httpStatus = 201 ;

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: incomingDocument ,
		collectionNode: this.collectionNode ,
		linkerObjectNode: this ,
		objectNode: this.collectionNode.createObjectNode( incomingDocument , [ this.app.root ] )
	} ;

	afterContext.output.data = { id: id } ;

	if ( this.collectionNode.afterCreateHook ) {
		try {
			await this.collectionNode.afterCreateHook( afterContext ) ;
		}
		catch ( error ) {
			// Send 201 anyway?
			return afterContext ;
		}
	}

	return afterContext ;
} ;



ObjectNode.prototype._patch = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var nextPath , nextCollection , linkDetails , patchDocument , document ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) ) {
		// Patch that object!

		if ( ! this.collectionNode ) {
			throw ErrorStatus.forbidden( "Cannot PATCH a static node." ) ;
		}

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			throw ErrorStatus.badRequest( "The body of a PATCH request should be a strict Object." ) ;
		}

		// Prefix the patch, if needed...
		patchDocument = pathParts.length ?
			restQuery.Node.prefixPatchDocument( incomingDocument , pathParts[ 0 ].identifier ) :
			incomingDocument ;

		// Check access, finding out the patch tier-level
		await this.checkPatchWriteAccess( context , patchDocument ) ;
		return this.patchDocument( pathParts , patchDocument , attachmentStreams , context ) ;
	}

	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextPath = pathParts.slice( 1 ) ;
			nextCollection = pathParts[ 0 ].identifier ;
			break ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			nextPath = pathParts ;
			nextCollection = this.autoCollection ;
			break ;

		case 'linkProperty' :

			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No link property on a static node.' ) ;
			}

			// If there is only one part left, then it's a putLink request
			if ( pathParts.length === 1 ) {
				return this.patchLink( pathParts , incomingDocument , attachmentStreams , context ) ;
			}

			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } ) ;

			// Not possible, .getLink() called without the 'acceptAttachment' option
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a PATCH on/through an Attachment.' ) ;
				return ;
			}
			*/

			var collection = this.app.collectionNodes[ document._.collection.name ] ;
			// we instanciate an objectNode to query
			var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

			return objectNode._patch(
				pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;

		case 'multiLinkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			return this.app.collectionNodes[ linkDetails.foreignCollection ]._patch(
				pathParts.slice( 1 ) ,
				incomingDocument ,
				attachmentStreams ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}

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
} ;



ObjectNode.prototype.patchDocument = async function( pathParts , patchDocument , attachmentStreams , context ) {
	var beforeContext , afterContext ;

	context.documentPatch = patchDocument ;

	// Do not modify the parent in a PATCH request
	this.collectionNode.collection.deleteId( context.documentPatch ) ;
	delete context.documentPatch.parent ;
	delete context.documentPatch['parent.id'] ;
	delete context.documentPatch['parent.collection'] ;

	if ( this.collectionNode.beforeModifyHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			existingDocument: this.object ,
			incomingPatch: context.documentPatch ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		await this.collectionNode.beforeModifyHook( beforeContext ) ;
	}

	try {
		this.collectionNode.initPatch( context.documentPatch ) ;
		this.collectionNode.checkAlterSchema( context.documentPatch , context , true ) ;
		this.object.patch( context.documentPatch ) ;
		await this.object.commit( { attachmentStreams: attachmentStreams } ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		document: this.object ,
		collectionNode: this.collectionNode ,
		objectNode: this
	} ;

	if ( this.collectionNode.afterModifyHook ) {
		try {
			await this.collectionNode.afterModifyHook( afterContext ) ;
		}
		catch ( error ) {
			// Send 201 anyway?
			return afterContext ;
		}
	}

	return afterContext ;
} ;



ObjectNode.prototype.patchLink = async function( pathParts , incomingDocument , attachmentStreams , context ) {
	var document , collection , objectNode ;

	// We cannot really use the CollectionNode#patch(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } ) ;

	// Not possible, .getLink() called without the 'acceptAttachment' option
	/*
	if ( document instanceof rootsDb.Attachment ) {
		// It's an attachment, it cannot be patched
		throw ErrorStatus.badRequest( 'Cannot perform a PATCH on/through an Attachment.' ) ;
	}
	*/

	collection = this.app.collectionNodes[ document._.collection.name ] ;
	// we instanciate an objectNode to query
	objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

	return objectNode._patch(
		pathParts.slice( 1 ) ,
		incomingDocument ,
		attachmentStreams ,
		{
			input: context.input ,
			output: context.output ,
			alter: {}
		}
	) ;
} ;



ObjectNode.prototype._delete = async function( pathParts , context ) {
	var nextPath , nextCollection , documentPatch , linkDetails , document , collection , objectNode ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 ) {
		// If we are here, we are about to DELETE an existing object
		if ( ! this.collectionNode ) {
			throw ErrorStatus.forbidden( "Cannot DELETE a static node." ) ;
		}

		// Check access
		await this.checkDeleteAccess( context ) ;
		return this.deleteDocument( pathParts , context ) ;
	}

	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) {
		documentPatch = {} ;
		documentPatch[ pathParts[ 0 ].identifier ] = undefined ;
		return this._patch( [] , documentPatch , null , context ) ;
	}


	// Pass through that object!

	// Check access
	await this.checkTraverseAccess( context ) ;

	switch ( pathParts[ 0 ].type ) {
		case 'collection' :
			if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
				throw ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ;
			}

			nextPath = pathParts.slice( 1 ) ;
			nextCollection = pathParts[ 0 ].identifier ;
			break ;

		case 'id' :
		case 'slugId' :
			if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
				throw ErrorStatus.notFound( "No auto collection on this item." ) ;
			}

			nextPath = pathParts ;
			nextCollection = this.autoCollection ;
			break ;

		case 'linkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No link property on a static node.' ) ;
			}

			// If there is only one part left, then it's a deleteLink request
			if ( pathParts.length === 1 ) {
				return this.deleteLink( pathParts , context ) ;
			}

			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } ) ;

			// Not possible, .getLink() called without the 'acceptAttachment' option
			/*
			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, that's not possible to traverse them
				throw ErrorStatus.badRequest( 'Cannot perform a DELETE on/through an Attachment.' ) ;
			}
			*/

			collection = this.app.collectionNodes[ document._.collection.name ] ;
			// we instanciate an objectNode to query
			objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

			return objectNode._delete(
				pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {}
				}
			) ;

		case 'multiLinkProperty' :
			if ( ! this.collectionNode ) {
				throw ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ;
			}

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			return this.app.collectionNodes[ linkDetails.foreignCollection ]._delete(
				pathParts.slice( 1 ) ,
				{
					input: context.input ,
					output: context.output ,
					alter: {} ,
					batchOf: linkDetails.foreignIds ,
					linker: this ,
					linkerPath: pathParts[ 0 ].identifier ,
					parentObjectNode: this.app.root
				}
			) ;

		default :
			throw ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ;
	}


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
} ;



ObjectNode.prototype.deleteDocument = async function( pathParts , context ) {
	var beforeContext , afterContext , idStr ;

	if ( this.collectionNode.beforeDeleteHook ) {
		beforeContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			existingDocument: this.object ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		await this.collectionNode.beforeDeleteHook( beforeContext ) ;
	}

	// /!\ Should delete all children too!!! /!\

	try {
		await this.object.delete() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	afterContext = {
		input: context.input ,
		output: context.output ,
		alter: context.alter ,
		deletedDocument: this.object ,
		collectionNode: this.collectionNode ,
		objectNode: this	// /!\ Does it make sense?
	} ;


	if ( context.batchOf ) {
		// batchOf is a ref to the actual array of link
		idStr = this.object._id.toString() ;

		context.batchOf = context.batchOf.splice(  context.batchOf.findIndex( element => element.toString() === idStr )  ,  1  ) ;
		context.linker.object.stage( context.linkerPath ) ;

		afterContext.batchOf = context.batchOf ;
		afterContext.linker = context.linker ;

		try {
			await context.linker.object.commit() ;
		}
		catch ( error ) {
			// Send 201 anyway?
			return afterContext ;
		}
	}

	if ( this.collectionNode.afterDeleteHook ) {
		try {
			await this.collectionNode.afterDeleteHook( afterContext ) ;
		}
		catch ( error ) {
			// Send 201 anyway?
			return afterContext ;
		}
	}

	return afterContext ;
} ;



// Unlink and delete the target
// /!\ Obsolete? Replace it by deleteDocument()? (deleteDocument() is already used for deleting a link from a multi-link).
ObjectNode.prototype.deleteLink = async function( pathParts , context ) {
	var document , afterContext , collection , objectNode ;

	// We cannot really use the CollectionNode#delete(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	document = await this.object.getLink( pathParts[ 0 ].identifier , { multi: false } , true ) ;

	if ( document instanceof rootsDb.Attachment ) {
		// It's an attachment, delete it's meta-data property
		// This will delete the file on HD

		try {
			await this.object.removeAttachment( pathParts[ 0 ].identifier ) ;
			await this.object.commit() ;
		}
		catch ( error ) {
			throw this.transformError( error ) ;
		}

		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			document: this.object ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		return afterContext ;
	}

	collection = this.app.collectionNodes[ document._.collection.name ] ;
	// we instanciate an objectNode to query
	objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

	return objectNode._delete(
		pathParts.slice( 1 ) ,
		{
			input: context.input ,
			output: context.output ,
			alter: {}
		}
	) ;
} ;



/*
	checkTraverseAccess( context )
*/
ObjectNode.prototype.checkTraverseAccess = function( context ) {
	return restQuery.Node.checkAccess(
		context.input.performer ,
		'traverse' ,
		1 ,
		this.collectionNode ,
		this.object ,
		this.ancestors
	) ;
} ;



/*
	checkReadAccess( context )
*/
ObjectNode.prototype.checkReadAccess = function( context ) {
	return restQuery.Node.checkAccess(
		context.input.performer ,
		'read' ,
		context.input.tier ,	// 1 ,
		this.collectionNode ,
		this.object ,
		this.ancestors
	) ;
} ;



/*
	checkReplaceWriteAccess( context )
*/
ObjectNode.prototype.checkReplaceWriteAccess = function( context ) {
	/*
		/!\ access 4 or 5?
		Or should a special access type 'replace' be created?
		Or double-check for 'delete' on this node and 'create' on the parent node?
		Well, 'write 4' looks ok: one should have a 'restricted' access to the ressource.
	*/

	return restQuery.Node.checkAccess(
		context.input.performer ,
		'write' ,
		4 ,
		this.collectionNode ,
		this.object ,
		this.ancestors
	) ;
} ;



/*
	checkPatchWriteAccess( context , patchDocument )

	Find out the patch tier-level and check write access for that.
*/
ObjectNode.prototype.checkPatchWriteAccess = function( context , patchDocument ) {
	var tier ;

	try {
		tier = doormen.patchTier( this.collectionNode.collection.documentSchema , patchDocument ) ;
	}
	catch ( error ) {
		return Promise.reject( ErrorStatus.badRequest( error ) ) ;
	}

	//console.log( "Patch tier-level:" , tier ) ;

	return restQuery.Node.checkAccess(
		context.input.performer ,
		'write' ,
		tier ,
		this.collectionNode ,
		this.object ,
		this.ancestors
	) ;
} ;



/*
	checkCreateLinkAccess( context )
*/
ObjectNode.prototype.checkCreateLinkAccess = function( context , path ) {
	var tier ;

	try {
		tier = doormen.path( this.collectionNode.collection.documentSchema , path ).tier || 1 ;
	}
	catch ( error ) {
		return Promise.reject( ErrorStatus.badRequest( error ) ) ;
	}

	return restQuery.Node.checkAccess(
		context.input.performer ,
		'write' ,
		tier ,
		this.collectionNode ,
		this.object ,
		this.ancestors
	).then( () => restQuery.Node.checkAccess(
		context.input.performer ,
		'create' ,
		1 ,
		null ,
		this.app.root.object ,
		this.app.root.ancestors
	) ) ;
} ;



/*
	checkDeleteAccess( context )
*/
ObjectNode.prototype.checkDeleteAccess = function( context ) {
	return restQuery.Node.checkAccess(
		context.input.performer ,
		'delete' ,
		1 ,
		this.collectionNode ,
		this.object ,
		this.ancestors
	) ;
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

