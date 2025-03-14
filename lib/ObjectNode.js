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
const doormen = require( 'doormen' ) ;
const tree = require( 'tree-kit' ) ;
const rootsDb = require( 'roots-db' ) ;
const restQuery = require( './restQuery.js' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;

// Attachment key when it is not provided
const DEFAULT_ATTACHMENT_KEY = 'source' ;



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

	var response = await this.methods[ methodName ]( context ) ;
	if ( response !== undefined ) { context.output.data = response ; }

	return context ;
} ;



ObjectNode.prototype._get = async function( context ) {
	var nextCollection , nextCollectionNode , nextObjectNode , linkDetails , document , setKey , attachment , readStream ;

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
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false , attachment: true } ) ;

			if ( document instanceof rootsDb.Attachment ) {
				// It's an attachment, send back the readable stream, with its meta-data
				attachment = document ;
				readStream = await attachment.getReadStream() ;
				context.output.meta = attachment ;
				context.output.data = readStream ;
				return context ;
			}

			if ( document instanceof rootsDb.AttachmentSet ) {
				if ( context.pathParts.length > 2 || ( context.pathParts[ 1 ] && context.pathParts[ 1 ].type !== 'linkProperty' ) ) {
					// It's an AttachmentSet but too many parts is remaining
					throw ErrorStatus.badRequest( "At most one part of type 'linkProperty' should follow an AttachmentSet link." ) ;
				}

				setKey = context.pathParts[ 1 ]?.identifier ?? DEFAULT_ATTACHMENT_KEY ;
				attachment = document.get( setKey ) ;
				if ( ! attachment ) { throw ErrorStatus.notFound( "Attachment key '" + setKey + "' not found." ) ; }

				// It's an attachment, send back the readable stream, with its meta-data
				readStream = await attachment.getReadStream() ;
				context.output.meta = attachment ;
				context.output.data = readStream ;
				return context ;
			}

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			return nextObjectNode._get( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._get( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found [ObjectNode]." ) ;
	}
} ;



ObjectNode.prototype._post = async function( context ) {
	var nextCollection , nextCollectionNode , nextObjectNode , linkDetails , document ;

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

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary to check if it's an attachment

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			return nextObjectNode._post( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._post( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}
} ;



// If this method is called, it means that the object *EXISTS*,
// PUT on an unexistant object is performed at collection-level.
ObjectNode.prototype._put = async function( context ) {
	var nextCollection , nextCollectionNode , nextObjectNode , linkDetails , document ,
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

			// Special case: attachmentSet with a set key
			if ( context.pathParts.length === 2 ) {
				let details = this.object.getLinkDetails( context.pathParts[ 0 ].identifier , { attachment: true } ) ;
				if ( details.type === 'attachmentSet' ) {
					return this.putAttachmentInSet( context ) ;
				}
			}


			// ... else, we just pass through

			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false , attachment: true } ) ;

			if ( document instanceof rootsDb.Attachment ) {
				// It's an Attachment but too many parts is remaining
				throw ErrorStatus.badRequest( "Can't go further than 1 part after an Attachment link." ) ;
			}

			if ( document instanceof rootsDb.AttachmentSet ) {
				if ( context.pathParts.length > 2 || ( context.pathParts[ 1 ] && context.pathParts[ 1 ].type !== 'linkProperty' ) ) {
					// It's an AttachmentSet but too many parts is remaining
					throw ErrorStatus.badRequest( "At most one part of type 'linkProperty' should follow an AttachmentSet link." ) ;
				}

				return this.putAttachmentInSet( context , document ) ;
			}

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			return nextObjectNode._put( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._put( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}
} ;



ObjectNode.prototype.putOverwriteDocument = async function( context ) {
	var id , initApplied = {} , document , incomingDocument ;

	incomingDocument = context.input.document ;

	// Create the ID for incomingDocument with the existing document
	id = this.collectionNode.collection.setId( incomingDocument , this.id ) ;

	incomingDocument.parent = {
		collection: this.ancestors[ 0 ].collectionNode && this.ancestors[ 0 ].collectionNode.name ,
		id: this.ancestors[ 0 ].id
	} ;

	// If no slug is provided, keep the current slug
	if ( ! incomingDocument.slugId ) { incomingDocument.slugId = this.object.slugId ; }

	if ( this.collectionNode.hooks.beforeCreate ) {
		await restQuery.hooks.run( this.collectionNode.hooks.beforeCreate , context , { incomingDocument , existingDocument: this.object } ) ;
		if ( context.isDone ) { return context ; }
	}

	try {
		this.collectionNode.initDocument( incomingDocument , initApplied ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		document = context.document = this.collectionNode.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	if ( this.collectionNode.hooks.beforeCreateAfterValidate && this.collectionNode.hooks.beforeCreateAfterValidate.length ) {
		// This special hook triggers the validation of the document NOW, then run this hook,
		// avoiding doing some jobs on a document that will not validate.
		// E.g.: avoid reserving a counter/auto-increment for invoice naming scheme.
		try {
			document.validate() ;
		}
		catch ( error ) {
			throw this.transformError( error ) ;
		}

		await restQuery.hooks.run( this.collectionNode.hooks.beforeCreateAfterValidate , context , { existingDocument: this.object } ) ;
		if ( context.isDone ) { return context ; }
		this.collectionNode.initDocument( document , initApplied ) ;
	}

	try {
		// We are replacing an object, so we need to clear attachments first
		await document.save( { overwrite: true , clearAttachments: true , attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.collectionNode.manageRetries( document , error , 'save' , { overwrite: true , clearAttachments: true , attachmentStreams: context.input.attachmentStreams } ) ;
	}

	context.output.httpStatus = 200 ;

	// 'this' is now obsolete as the object node
	context.objectNode = this.collectionNode.createObjectNode( document , [ this , ... this.ancestors ] , context.alter ) ;
	context.output.data = { id: id } ;

	if ( this.collectionNode.hooks.afterCreate ) {
		await restQuery.hooks.runAfter( this.collectionNode.hooks.afterCreate , context , { deletedDocument: this.object } ) ;
	}

	return context ;
} ;



ObjectNode.prototype.putLink = async function( context ) {
	var document , nextCollectionNode , nextObjectNode , details , incomingDocument ;

	incomingDocument = context.input.document ;

	// We cannot really use the CollectionNode#put(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.

	try {
		document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false , attachment: true } ) ;
	}
	catch ( error ) {
		if ( error.type === 'notFound' && context.pathParts.length === 1 ) {
			// This is a normal case: the target does not exist yet,
			// and should be created by the request

			details = this.object.getLinkDetails( context.pathParts[ 0 ].identifier , { attachment: true } ) ;

			if ( details.type === 'attachment' ) {
				// First, check if the documentPath is set (it could be optional when directly putting on a link
				let attachment = context.input.attachmentStreams.list[ 0 ] ;
				if ( attachment && ! attachment.documentPath ) {
					attachment.documentPath = context.pathParts[ 0 ].identifier ;
				}

				try {
					await this.object.commit( { attachmentStreams: context.input.attachmentStreams } ) ;
				}
				catch ( error_ ) {
					throw this.transformError( error_ ) ;
				}

				return context ;
			}

			if ( details.type === 'attachmentSet' ) {
				return this.putAttachmentInSet( context ) ;
			}

			if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
				throw ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ;
			}

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

	if ( document instanceof rootsDb.AttachmentSet ) {
		return this.putAttachmentInSet( context , document ) ;
	}

	nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

	// we instanciate an objectNode to query
	nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

	return nextObjectNode._put( context.nextObjectNode( nextObjectNode , true , false ) ) ;
} ;



ObjectNode.prototype.putNewLinkedDocument = async function( context ) {
	var id , initApplied = {} , document , incomingDocument ;

	incomingDocument = context.input.document ;

	incomingDocument.parent = {
		collection: 'root' ,
		id: '/'
	} ;

	// Create the ID
	//id = this.collectionNode.collection.setId( incomingDocument ) ;
	id = context.targetCollectionNode.collection.setId( incomingDocument ) ;

	if ( context.targetCollectionNode.hooks.beforeCreate ) {
		await restQuery.hooks.run( context.targetCollectionNode.hooks.beforeCreate , context , { incomingDocument } ) ;
		if ( context.isDone ) { return context ; }
	}

	try {
		//this.collectionNode.initDocument( incomingDocument , initApplied ) ;
		context.targetCollectionNode.initDocument( incomingDocument , initApplied ) ;
		//this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		context.targetCollectionNode.checkAlterSchema( incomingDocument , context ) ;
		document = context.document = context.targetCollectionNode.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	if ( context.targetCollectionNode.hooks.beforeCreateAfterValidate && context.targetCollectionNode.hooks.beforeCreateAfterValidate.length ) {
		// This special hook triggers the validation of the document NOW, then run this hook,
		// avoiding doing some jobs on a document that will not validate.
		// E.g.: avoid reserving a counter/auto-increment for invoice naming scheme.
		try {
			document.validate() ;
		}
		catch ( error ) {
			throw this.transformError( error ) ;
		}

		await restQuery.hooks.run( context.targetCollectionNode.hooks.beforeCreateAfterValidate , context ) ;
		if ( context.isDone ) { return context ; }
		context.targetCollectionNode.initDocument( document , initApplied ) ;
	}

	try {
		// /!\ What about Attachment?
		await document.save() ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.collectionNode.manageRetries( document , error , 'save' ) ;
	}

	try {
		this.object.setLink( context.pathParts[ 0 ].identifier , document ) ;
		await this.object.commit() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	context.output.httpStatus = 201 ;
	//context.objectNode = this.collectionNode.createObjectNode( document , [ this.app.root ] ) ;
	context.objectNode = context.targetCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

	context.output.data = {
		id: id ,
		slugId: document.slugId
	} ;

	if ( context.targetCollectionNode.hooks.afterCreate ) {
		await restQuery.hooks.runAfter( context.targetCollectionNode.hooks.afterCreate , context ) ;
	}

	return context ;
} ;



ObjectNode.prototype.putAttachmentInSet = async function( context ) {
	var attachmentData = context.input.attachmentStreams.list[ 0 ] ;

	if ( attachmentData ) {
		attachmentData.documentPath = context.pathParts[ 0 ].identifier ;
		attachmentData.setKey = context.pathParts[ 1 ]?.identifier ?? DEFAULT_ATTACHMENT_KEY ;
	}

	try {
		await this.object.commit( { attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
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

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary to check if it's an attachment
			// It shouldn't be possible to patch attachment anyway...

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			return nextObjectNode._patch( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._patch( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}
} ;



ObjectNode.prototype.patchDocument = async function( context ) {
	var patch = context.patch || context.input.document ;	// IMPORTANT!

	context.patch = patch ;

	// Do not modify the parent in a PATCH request
	this.collectionNode.collection.deleteId( patch ) ;
	delete patch.parent ;
	delete patch['parent.id'] ;
	delete patch['parent.collection'] ;

	if ( this.collectionNode.hooks.beforeModify ) {
		await restQuery.hooks.run( this.collectionNode.hooks.beforeModify , context , { incomingPatch: patch , existingDocument: this.object } ) ;
		if ( context.isDone ) { return context ; }
	}

	try {
		this.collectionNode.initPatch( patch ) ;
		this.collectionNode.checkAlterSchema( patch , context , true ) ;
		this.object.patch( patch , { validate: true } ) ;
		this.collectionNode.afterPatch( this.object , patch ) ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	try {
		await this.object.commit( { attachmentStreams: context.input.attachmentStreams } ) ;
	}
	catch ( error ) {
		// It can throw, in that case it has already called .transformError()
		await this.collectionNode.manageRetries( this.object , error , 'commit' , { attachmentStreams: context.input.attachmentStreams } ) ;
	}

	if ( this.collectionNode.hooks.afterModify ) {
		await restQuery.hooks.runAfter( this.collectionNode.hooks.afterModify , context , { appliedPatch: patch } ) ;
	}

	return context ;
} ;



ObjectNode.prototype.patchLink = async function( context ) {
	var document , nextCollectionNode , nextObjectNode ;

	// We cannot really use the CollectionNode#patch(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false } ) ;

	// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary to check if it's an attachment
	// It shouldn't be possible to patch attachment anyway...

	nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

	// we instanciate an objectNode to query
	nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

	return nextObjectNode._patch( context.nextObjectNode( nextObjectNode , true , false ) ) ;
} ;



ObjectNode.prototype._delete = async function( context ) {
	var nextCollection , nextCollectionNode , nextObjectNode , linkDetails , document ;

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

			// Since .getLink() is not used with 'acceptAttachment' on, this is not necessary to check if it's an attachment
			// It shouldn't be possible to delete attachment anyway: --> it uses deleteLink() for that

			nextCollectionNode = this.app.collectionNodes[ document._.collection.name ] ;

			// we instanciate an objectNode to query
			nextObjectNode = nextCollectionNode.createObjectNode( document , [ this.app.root ] ) ;

			return nextObjectNode._delete( context.linkToObjectNode( nextObjectNode , true ) ) ;

		case 'multiLinkProperty' :
			// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
			// of doing things, there is no ancestry link here, so we will just start from a brand new object
			// without any relationship with the former object.
			linkDetails = this.object.getLinkDetails( context.pathParts[ 0 ].identifier ) ;

			if ( ! linkDetails ) {
				throw ErrorStatus.badRequest( 'Multi-link not found.' ) ;
			}

			nextCollectionNode = this.app.collectionNodes[ linkDetails.foreignCollection ] ;
			return nextCollectionNode._delete( context.multiLinkToCollectionNode( nextCollectionNode , linkDetails.foreignIds , true ) ) ;

		default :
			throw ErrorStatus.notFound( "Type '" + context.pathParts[ 0 ].type + "' not found." ) ;
	}
} ;



ObjectNode.prototype.deleteDocument = async function( context ) {
	if ( this.collectionNode.hooks.beforeDelete ) {
		await restQuery.hooks.run( this.collectionNode.hooks.beforeDelete , context , { existingDocument: this.object } ) ;
		if ( context.isDone ) { return context ; }
	}

	// /!\ Should delete all children too!!! /!\

	try {
		await this.object.delete() ;
	}
	catch ( error ) {
		throw this.transformError( error ) ;
	}

	if ( context.batchOf ) {
		context.linkerObjectNode.object.removeLink( context.linkerPath , this.object ) ;

		try {
			await context.linkerObjectNode.object.commit() ;
		}
		catch ( error ) {
			log.error( "The Object's commit failed, but the request had already succeeded: %E" , error ) ;
			// Send 200 anyway?
			return context ;
		}
	}

	if ( this.collectionNode.hooks.afterDelete ) {
		await restQuery.hooks.runAfter( this.collectionNode.hooks.afterDelete , context , { deletedDocument: this.object } ) ;
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
	document = await this.object.getLink( context.pathParts[ 0 ].identifier , { multi: false , attachment: true } ) ;

	if ( document instanceof rootsDb.Attachment ) {
		// It's an attachment, delete it's meta-data property
		// This will delete the file on HD/storage

		try {
			this.object.removeAttachment( context.pathParts[ 0 ].identifier ) ;
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

	if ( context.input.query.populate || context.input.query.deepPopulate ) {
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
		tags = doormen.subSchema( this.collectionNode.collection.documentSchema , path ).tags || [ 'content' ] ;
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

