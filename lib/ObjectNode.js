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
ObjectNode.prototype.userMethodWrapper = function( methodName , pathParts , incomingDocument , attachmentStreams , context , callback ) {
	if ( ! this.methods[ methodName ] ) {
		callback( ErrorStatus.notFound( "Method '" + methodName + "' not found." ) ) ;
		return ;
	}

	// Reset output serializer, if any
	context.output.serializer = null ;
	context.output.serializerOpt1 = null ;
	context.output.serializerOpt2 = null ;

	// /!\ TMP!!!
	Promise.try(
		() => this.methods[ methodName ].call( this , pathParts , incomingDocument , attachmentStreams , context )
	).done(
		response => {

			if ( ! response || typeof response !== 'object' ) { response = {} ; }

			// There is no response context with promises!
			var responseContext = {} ;
			//if ( ! responseContext || typeof responseContext !== 'object' ) { responseContext = {} ; }

			responseContext.input = context.input ;
			responseContext.output = context.output ;
			responseContext.alter = context.alter ;
			responseContext.collectionNode = this.collectionNode ;
			responseContext.objectNode = this.objectNode ;

			callback( undefined , response , responseContext ) ;
		} ,
		error => { callback( error ) ; }
	) ;

	/*
	this.methods[ methodName ].call( this , pathParts , incomingDocument , attachmentStreams , context ,

		( error , response , responseContext ) => {

			if ( error ) { callback( error ) ; return ; }

			if ( ! response || typeof response !== 'object' ) { response = {} ; }
			if ( ! responseContext || typeof responseContext !== 'object' ) { responseContext = {} ; }

			responseContext.input = context.input ;
			responseContext.output = context.output ;
			responseContext.alter = context.alter ;
			responseContext.collectionNode = this.collectionNode ;
			responseContext.objectNode = this.objectNode ;

			callback( error , response , responseContext ) ;
		}
	) ;
	*/
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
	var nextPath , nextCollection , linkDetails , document , afterContext ;

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
ObjectNode.prototype._put = function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
	var nextPath , nextCollection , documentPatch , linkDetails ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 ) {
		// If we are here, we are about to REPLACE an existing object

		if ( ! this.collectionNode ) {
			callback( ErrorStatus.forbidden( "Cannot PUT into a static node." ) ) ;
			return ;
		}

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			callback( ErrorStatus.badRequest( "The body of a PUT request, replacing a whole document, should be a strict Object." ) ) ;
			return ;
		}

		// Check access
		this.checkReplaceWriteAccess( context , error => {
			if ( error ) { callback( error ) ; return ; }
			this.putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
		} ) ;

		return ;
	}

	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) {
		documentPatch = {} ;
		documentPatch[ pathParts[ 0 ].identifier ] = incomingDocument ;
		this._patch( [] , documentPatch , attachmentStreams , context , callback ) ;
		return ;
	}


	// Pass through that object!

	// Check access
	this.checkTraverseAccess( context , error => {

		if ( error ) { callback( error ) ; return ; }


		switch ( pathParts[ 0 ].type ) {
			case 'collection' :
				if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
					callback( ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ) ;
					return ;
				}

				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;

				break ;

			case 'id' :
			case 'slugId' :
				if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
					callback( ErrorStatus.notFound( "No auto collection on this item." ) ) ;
					return ;
				}

				nextPath = pathParts ;
				nextCollection = this.autoCollection ;

				break ;

			case 'linkProperty' :

				if ( ! this.collectionNode ) {
					callback( ErrorStatus.badRequest( 'No link property on a static node.' ) ) ;
					return ;
				}

				// If there is only one part left, then it's a putLink request
				if ( pathParts.length === 1 ) {
					this.putLink( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					return ;
				}

				// ... else, we just pass through

				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				this.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , ( getLinkError , document ) => {

					if ( getLinkError ) { callback( getLinkError ) ; return ; }

					if ( document instanceof rootsDb.Attachment ) {
						// It's an attachment, that's not possible to traverse them
						callback( ErrorStatus.badRequest( 'Cannot perform a PUT on/through an Attachment.' ) ) ;
						return ;
					}

					var collection = this.app.collectionNodes[ document._.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

					objectNode._put(
						incomingDocument ,
						attachmentStreams ,
						pathParts.slice( 1 ) ,
						{
							input: context.input ,
							output: context.output ,
							alter: {}
						} ,
						callback
					) ;
				} ) ;

				return ;

			case 'multiLinkProperty' :

				if ( ! this.collectionNode ) {
					callback( ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ) ;
					return ;
				}

				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = this.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;

				if ( ! linkDetails ) {
					callback( ErrorStatus.badRequest( 'Multi-link not found.' ) ) ;
					return ;
				}

				this.app.collectionNodes[ linkDetails.foreignCollection ]._put(
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
					} ,
					callback
				) ;

				return ;

			default :
				callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
				return ;
		}


		// Process the child collection
		this.children[ nextCollection ]._put(
			nextPath ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				parentObjectNode: this
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.putOverwriteDocument = function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
	var beforeContext , afterContext ;

	if ( ! context.beforeCreateDone ) {
		incomingDocument.parent = {
			collection: this.ancestors[ 0 ].collectionNode && this.ancestors[ 0 ].collectionNode.name ,
			id: this.ancestors[ 0 ].id
		} ;

		// Keep $id
		incomingDocument.$id = this.id ;

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

			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.collectionNode.beforeCreateHook( beforeContext ) )
				.done(
					() => {
						context.beforeCreateDone = true ;
						this.putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					} ,
					error => { callback( error ) ; }
				) ;

			/*
			this.collectionNode.beforeCreateHook( beforeContext , function( error ) {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				this.putOverwriteDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			*/

			return ;
		}
	}

	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		this.collectionNode.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( this.transformError( error ) ) ;
		return ;
	}

	incomingDocument.$.save( {
		overwrite: true ,
		clearAttachments: true ,	// We are replacing an object, so we need to clear attachments first
		attachmentStreams: attachmentStreams
	} , error => {

		if ( error ) { callback( this.transformError( error ) ) ; return ; }

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

		if ( ! this.collectionNode.afterCreateHook ) {
			callback( undefined , {} , afterContext ) ;
			return ;
		}

		// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
		// will be patched later with async/await
		Promise.try( () => this.collectionNode.afterCreateHook( afterContext ) )
			.done(
				() => {
					callback( undefined , {} , afterContext ) ;
				} ,
				error_ => {
					// Send 200 anyway?
					callback( error_ , {} , afterContext ) ;
				}
			) ;

		/*
			this.collectionNode.afterCreateHook( afterContext , error => {
				// Send 200 anyway?
				if ( error ) { callback( error , {} , afterContext ) ; return ; }
				callback( undefined , {} , afterContext ) ;
			} ) ;
			*/
	}
	) ;
} ;



ObjectNode.prototype.putLink = function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
	var afterContext ;

	// We cannot really use the CollectionNode#put(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	this.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , ( error , document ) => {

		var collection , objectNode , details ;

		if ( error ) {
			if ( error.type === 'notFound' && pathParts.length === 1 ) {
				// This is a normal case: the target does not exist yet,
				// and should be created by the request

				details = this.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;

				if ( details.type === 'attachment' ) {
					this.object.$.commit( { attachmentStreams: attachmentStreams } , commitError => {

						if ( commitError ) { callback( this.transformError( commitError ) ) ; return ; }

						afterContext = {
							input: context.input ,
							output: context.output ,
							alter: context.alter ,
							document: this.object ,
							collectionNode: this.collectionNode ,
							objectNode: this
						} ;

						callback( undefined , {} , afterContext ) ;
					} ) ;

					return ;
				}
				else if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
					callback( ErrorStatus.badRequest( "The body of a PUT request, creating a new document, should be a strict Object." ) ) ;
					return ;
				}


				//collection = this.app.collectionNodes[ details.foreignCollection ].collection ;

				this.checkCreateLinkAccess( context , pathParts[ 0 ].identifier , checkError => {
					if ( checkError ) { callback( checkError ) ; return ; }
					context.targetCollectionNode = this.app.collectionNodes[ details.foreignCollection ] ;
					this.putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
				} ) ;

				return ;
			}

			callback( error ) ;
			return ;

		}

		if ( document instanceof rootsDb.Attachment ) {
			this.object.$.commit( { attachmentStreams: attachmentStreams } , commitError => {

				if ( commitError ) { callback( this.transformError( commitError ) ) ; return ; }

				afterContext = {
					input: context.input ,
					output: context.output ,
					alter: context.alter ,
					document: this.object ,
					collectionNode: this.collectionNode ,
					objectNode: this
				} ;

				callback( undefined , {} , afterContext ) ;
			} ) ;

			return ;
		}

		collection = this.app.collectionNodes[ document._.collection.name ] ;

		// we instanciate an objectNode to query
		objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

		objectNode._put(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: {}
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.putNewLinkedDocument = function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
	var beforeContext , afterContext , id ;

	if ( ! context.beforeCreateDone ) {
		incomingDocument.parent = {
			collection: null ,
			id: '/'
		} ;

		incomingDocument.$id = context.targetCollectionNode.collection.createId( incomingDocument ) ;

		if ( context.targetCollectionNode.beforeCreateHook ) {
			beforeContext = {
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				incomingDocument: incomingDocument ,
				collectionNode: this.collectionNode ,
				linkerObjectNode: this
			} ;

			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => context.targetCollectionNode.beforeCreateHook( beforeContext ) )
				.done(
					() => {
						context.beforeCreateDone = true ;
						this.putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					} ,
					error_ => { callback( error_ ) ; }
				) ;

			/*
			context.targetCollectionNode.beforeCreateHook( beforeContext , error => {
				if ( error ) { callback( error ) ; return ; }
				context.beforeCreateDone = true ;
				this.putNewLinkedDocument( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
			} ) ;
			*/

			return ;
		}
	}

	try {
		this.collectionNode.initDocument( incomingDocument ) ;
		this.collectionNode.checkAlterSchema( incomingDocument , context ) ;
		id = incomingDocument.$id ;
		context.targetCollectionNode.collection.createDocument( incomingDocument ) ;
	}
	catch ( error ) {
		callback( this.transformError( error ) ) ;
		return ;
	}

	incomingDocument.$.save( error => {
		if ( error ) { callback( this.transformError( error ) ) ; return ; }

		this.object.$.setLink( pathParts[ 0 ].identifier , incomingDocument ) ;

		this.object.$.commit( commitError => {

			if ( commitError ) { callback( this.transformError( commitError ) ) ; return ; }

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

			if ( ! this.collectionNode.afterCreateHook ) {
				callback( undefined , { id: id } , afterContext ) ;
				return ;
			}

			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.collectionNode.afterCreateHook( afterContext ) )
				.done(
					() => {
						callback( undefined , { id: id } , afterContext ) ;
					} ,
					error_ => {
					// Send 201 anyway?
						callback( error_ , { id: id } , afterContext ) ;
					}
				) ;

			/*
			this.collectionNode.afterCreateHook( afterContext , error => {
				// Send 201 anyway?
				if ( error ) { callback( error , { id: id } , afterContext ) ; return ; }
				callback( undefined , { id: id } , afterContext ) ;
			} ) ;
			*/
		} ) ;
	} ) ;
} ;



ObjectNode.prototype._patch = function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
	var nextPath , nextCollection , linkDetails , patchDocument ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 || ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) ) {
		// Patch that object!

		if ( ! this.collectionNode ) {
			callback( ErrorStatus.forbidden( "Cannot PATCH a static node." ) ) ;
			return ;
		}

		if ( ! incomingDocument || typeof incomingDocument !== 'object' || Array.isArray( incomingDocument ) ) {
			callback( ErrorStatus.badRequest( "The body of a PATCH request should be a strict Object." ) ) ;
			return ;
		}

		// Prefix the patch, if needed...
		patchDocument = pathParts.length ?
			restQuery.Node.prefixPatchDocument( incomingDocument , pathParts[ 0 ].identifier ) :
			incomingDocument ;

		// Check access, finding out the patch tier-level
		this.checkPatchWriteAccess( context , patchDocument , error => {
			if ( error ) { callback( error ) ; return ; }
			this.patchDocument( pathParts , patchDocument , attachmentStreams , context , callback ) ;
		} ) ;

		return ;
	}

	// Pass through that object!

	// Check access
	this.checkTraverseAccess( context , error => {

		if ( error ) { callback( error ) ; return ; }


		switch ( pathParts[ 0 ].type ) {
			case 'collection' :
				if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
					callback( ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ) ;
					return ;
				}

				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;

				break ;

			case 'id' :
			case 'slugId' :
				if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
					callback( ErrorStatus.notFound( "No auto collection on this item." ) ) ;
					return ;
				}

				nextPath = pathParts ;
				nextCollection = this.autoCollection ;

				break ;

			case 'linkProperty' :

				if ( ! this.collectionNode ) {
					callback( ErrorStatus.badRequest( 'No link property on a static node.' ) ) ;
					return ;
				}

				// If there is only one part left, then it's a putLink request
				if ( pathParts.length === 1 ) {
					this.patchLink( pathParts , incomingDocument , attachmentStreams , context , callback ) ;
					return ;
				}

				// ... else, we just pass through

				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				this.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , ( getLinkError , document ) => {

					if ( getLinkError ) { callback( getLinkError ) ; return ; }

					if ( document instanceof rootsDb.Attachment ) {
						// It's an attachment, that's not possible to traverse them
						callback( ErrorStatus.badRequest( 'Cannot perform a PATCH on/through an Attachment.' ) ) ;
						return ;
					}

					var collection = this.app.collectionNodes[ document._.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

					objectNode._patch(
						pathParts.slice( 1 ) ,
						incomingDocument ,
						attachmentStreams ,
						{
							input: context.input ,
							output: context.output ,
							alter: {}
						} ,
						callback
					) ;
				} ) ;

				return ;

			case 'multiLinkProperty' :

				if ( ! this.collectionNode ) {
					callback( ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ) ;
					return ;
				}

				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = this.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;

				if ( ! linkDetails ) {
					callback( ErrorStatus.badRequest( 'Multi-link not found.' ) ) ;
					return ;
				}

				this.app.collectionNodes[ linkDetails.foreignCollection ]._patch(
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
					} ,
					callback
				) ;

				return ;

			default :
				callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
				return ;
		}


		// Process the child collection
		this.children[ nextCollection ]._patch(
			nextPath ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				parentObjectNode: this
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.patchDocument = function( pathParts , patchDocument , attachmentStreams , context , callback ) {
	var beforeContext , afterContext ;

	if ( ! context.beforeModifyDone ) {
		context.documentPatch = patchDocument ;

		// Do not modify the parent in a PATCH request
		delete context.documentPatch._id ;
		delete context.documentPatch.$id ;
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

			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.collectionNode.beforeModifyHook( beforeContext ) )
				.done(
					() => {
						context.beforeModifyDone = true ;
						this.patchDocument( pathParts , patchDocument , attachmentStreams , context , callback ) ;
					} ,
					error_ => { callback( error_ ) ; }
				) ;

			/*
			this.collectionNode.beforeModifyHook( beforeContext , error => {
				if ( error ) { callback( error ) ; return ; }
				context.beforeModifyDone = true ;
				this.patchDocument( pathParts , patchDocument , attachmentStreams , context , callback ) ;
			} ) ;
			*/
			return ;
		}
	}

	try {
		this.collectionNode.initPatch( context.documentPatch ) ;
		this.collectionNode.checkAlterSchema( context.documentPatch , context , true ) ;
		this.object.$.patch( context.documentPatch ) ;
	}
	catch ( error_ ) {
		callback( this.transformError( error_ ) ) ;
		return ;
	}

	this.object.$.commit( { attachmentStreams: attachmentStreams } , error => {

		if ( error ) { callback( this.transformError( error ) ) ; return ; }

		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			document: this.object ,
			collectionNode: this.collectionNode ,
			objectNode: this
		} ;

		if ( ! this.collectionNode.afterModifyHook ) {
			callback( undefined , {} , afterContext ) ;
			return ;
		}

		// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
		// will be patched later with async/await
		Promise.try( () => this.collectionNode.afterModifyHook( afterContext ) )
			.done(
				() => {
					callback( undefined , {} , afterContext ) ;
				} ,
				error_ => {
				// Send 201 anyway?
					callback( error_ , {} , afterContext ) ;
				}
			) ;

		/*
		this.collectionNode.afterModifyHook( afterContext , error => {
			if ( error ) { callback( error ) ; return ; }
			callback( undefined , {} , afterContext ) ;
		} ) ;
		*/
	} ) ;
} ;



ObjectNode.prototype.patchLink = function( pathParts , incomingDocument , attachmentStreams , context , callback ) {
	// We cannot really use the CollectionNode#patch(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	this.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , ( error , document ) => {

		if ( error ) { callback( error ) ; return ; }

		if ( document instanceof rootsDb.Attachment ) {
			// It's an attachment, it cannot be patched
			callback( ErrorStatus.badRequest( 'Cannot perform a PATCH on/through an Attachment.' ) ) ;
			return ;
		}

		var collection = this.app.collectionNodes[ document._.collection.name ] ;
		// we instanciate an objectNode to query
		var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

		objectNode._patch(
			pathParts.slice( 1 ) ,
			incomingDocument ,
			attachmentStreams ,
			{
				input: context.input ,
				output: context.output ,
				alter: {}
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype._delete = function( pathParts , context , callback ) {
	var nextPath , nextCollection , documentPatch , linkDetails ;

	this.alteration( context ) ;

	if ( pathParts.length === 0 ) {
		// If we are here, we are about to DELETE an existing object

		if ( ! this.collectionNode ) {
			callback( ErrorStatus.forbidden( "Cannot DELETE a static node." ) ) ;
			return ;
		}

		// Check access
		this.checkDeleteAccess( context , error => {
			if ( error ) { callback( error ) ; return ; }
			this.deleteDocument( pathParts , context , callback ) ;
		} ) ;

		return ;
	}

	// The next and final node is a property node, transform that into a PATCH request
	if ( pathParts.length === 1 && pathParts[ 0 ].type === 'property' ) {
		documentPatch = {} ;
		documentPatch[ pathParts[ 0 ].identifier ] = undefined ;
		this._patch( [] , documentPatch , null , context , callback ) ;
		return ;
	}


	// Pass through that object!

	// Check access
	this.checkTraverseAccess( context , error => {

		if ( error ) { callback( error ) ; return ; }


		switch ( pathParts[ 0 ].type ) {
			case 'collection' :
				if ( ! this.children[ pathParts[ 0 ].identifier ] ) {
					callback( ErrorStatus.notFound( "Collection '" + pathParts[ 0 ].identifier + "' not found." ) ) ;
					return ;
				}

				nextPath = pathParts.slice( 1 ) ;
				nextCollection = pathParts[ 0 ].identifier ;

				break ;

			case 'id' :
			case 'slugId' :
				if ( ! this.autoCollection || ! this.children[ this.autoCollection ] ) {
					callback( ErrorStatus.notFound( "No auto collection on this item." ) ) ;
					return ;
				}

				nextPath = pathParts ;
				nextCollection = this.autoCollection ;

				break ;

			case 'linkProperty' :

				if ( ! this.collectionNode ) {
					callback( ErrorStatus.badRequest( 'No link property on a static node.' ) ) ;
					return ;
				}

				// If there is only one part left, then it's a deleteLink request
				if ( pathParts.length === 1 ) {
					this.deleteLink( pathParts , context , callback ) ;
					return ;
				}

				// ... else, we just pass through

				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				this.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , ( getLinkError , document ) => {

					if ( getLinkError ) { callback( getLinkError ) ; return ; }

					if ( document instanceof rootsDb.Attachment ) {
						// It's an attachment, that's not possible to traverse them
						callback( ErrorStatus.badRequest( 'Cannot perform a DELETE on/through an Attachment.' ) ) ;
						return ;
					}

					var collection = this.app.collectionNodes[ document._.collection.name ] ;
					// we instanciate an objectNode to query
					var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

					objectNode._delete(
						pathParts.slice( 1 ) ,
						{
							input: context.input ,
							output: context.output ,
							alter: {}
						} ,
						callback
					) ;
				} ) ;

				return ;

			case 'multiLinkProperty' :

				if ( ! this.collectionNode ) {
					callback( ErrorStatus.badRequest( 'No multi-link property on a static node.' ) ) ;
					return ;
				}

				// We cannot really use the CollectionNode#get(), because we are not in the standard RestQuery way
				// of doing things, there is no ancestry link here, so we will just start from a brand new object
				// without any relationship with the former object.
				linkDetails = this.object.$.getLinkDetails( pathParts[ 0 ].identifier ) ;

				if ( ! linkDetails ) {
					callback( ErrorStatus.badRequest( 'Multi-link not found.' ) ) ;
					return ;
				}

				this.app.collectionNodes[ linkDetails.foreignCollection ]._delete(
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
					callback
				) ;

				return ;

			default :
				callback( ErrorStatus.notFound( "'" + pathParts[ 0 ].type + "' not found." ) ) ;
				return ;
		}


		// Process the child collection
		this.children[ nextCollection ]._delete(
			nextPath ,
			{
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				parentObjectNode: this
			} ,
			callback
		) ;
	} ) ;
} ;



ObjectNode.prototype.deleteDocument = function( pathParts , context , callback ) {
	var beforeContext , afterContext ;

	if ( ! context.beforeDeleteDone ) {
		if ( this.collectionNode.beforeDeleteHook ) {
			beforeContext = {
				input: context.input ,
				output: context.output ,
				alter: context.alter ,
				existingDocument: this.object ,
				collectionNode: this.collectionNode ,
				objectNode: this
			} ;

			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.collectionNode.beforeDeleteHook( beforeContext ) )
				.done(
					() => {
						context.beforeDeleteDone = true ;
						this.deleteDocument( pathParts , context , callback ) ;
					} ,
					error_ => { callback( error_ ) ; }
				) ;

			/*
			this.collectionNode.beforeDeleteHook( beforeContext , error => {
				if ( error ) { callback( error ) ; return ; }
				context.beforeDeleteDone = true ;
				this.deleteDocument( pathParts , context , callback ) ;
			} ) ;
			*/
			return ;
		}
	}

	// /!\ Should delete all children too!!! /!\

	this.object.$.delete( error => {

		if ( error ) { callback( this.transformError( error ) ) ; return ; }

		var idStr ;

		afterContext = {
			input: context.input ,
			output: context.output ,
			alter: context.alter ,
			deletedDocument: this.object ,
			collectionNode: this.collectionNode ,
			objectNode: this	// /!\ Does it make sense?
		} ;

		var hook = () => {

			if ( ! this.collectionNode.afterDeleteHook ) {
				callback( undefined , {} , afterContext ) ;
				return ;
			}

			// /!\ Temporary patch, hooks must be promise right now, but the internal machinery
			// will be patched later with async/await
			Promise.try( () => this.collectionNode.afterDeleteHook( afterContext ) )
				.done(
					() => {
						callback( undefined , {} , afterContext ) ;
					} ,
					error_ => {
						callback( error_ ) ;
					}
				) ;

			/*
			this.collectionNode.afterDeleteHook( afterContext , error => {
				if ( error ) { callback( error ) ; return ; }
				callback( undefined , {} , afterContext ) ;
			} ) ;
			*/
		} ;

		if ( context.batchOf ) {
			// batchOf is a ref to the actual array of link
			idStr = this.object._id.toString() ;

			context.batchOf = context.batchOf.splice(  context.batchOf.findIndex( element => element.toString() === idStr )  ,  1  ) ;
			context.linker.object.$.stage( context.linkerPath ) ;

			afterContext.batchOf = context.batchOf ;
			afterContext.linker = context.linker ;

			context.linker.object.$.commit( commitError => {
				// Send 201 anyway?
				if ( commitError ) { callback( commitError , {} , afterContext ) ; return ; }

				hook() ;
			} ) ;
		}
		else {
			hook() ;
		}
	} ) ;
} ;



// Unlink and delete the target
// /!\ Obsolete? Replace it by deleteDocument()? (deleteDocument() is already used for deleting a link from a multi-link).
ObjectNode.prototype.deleteLink = function( pathParts , context , callback ) {
	// We cannot really use the CollectionNode#delete(), because we are not in the standard RestQuery way
	// of doing things, there is no ancestry link here, so we will just start from a brand new object
	// without any relationship with the former object.
	this.object.$.getLink( pathParts[ 0 ].identifier , { multi: false } , ( error , document ) => {

		if ( error ) { callback( error ) ; return ; }

		if ( document instanceof rootsDb.Attachment ) {
			// It's an attachment, delete it's meta-data property
			// This will delete the file on HD
			this.object.$.setLink( pathParts[ 0 ].identifier , null ) ;
			this.object.$.stage( pathParts[ 0 ].identifier ) ;

			this.object.$.commit( commitError => {
				if ( commitError ) { callback( this.transformError( commitError ) ) ; return ; }

				var afterContext = {
					input: context.input ,
					output: context.output ,
					alter: context.alter ,
					document: this.object ,
					collectionNode: this.collectionNode ,
					objectNode: this
				} ;

				callback( undefined , {} , afterContext ) ;
			} ) ;
			return ;
		}

		var collection = this.app.collectionNodes[ document._.collection.name ] ;
		// we instanciate an objectNode to query
		var objectNode = collection.createObjectNode( document , [ this.app.root ] ) ;

		objectNode._delete(
			pathParts.slice( 1 ) ,
			{
				input: context.input ,
				output: context.output ,
				alter: {}
			} ,
			callback
		) ;
	} ) ;
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

