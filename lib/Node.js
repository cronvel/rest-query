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



const restQuery = require( './restQuery.js' ) ;
const Promise = require( 'seventh' ) ;
const ErrorStatus = require( 'error-status' ) ;

const log = require( 'logfella' ).global.use( 'rest-query' ) ;
//const rootsDb = require( 'roots-db' ) ;



/* Common Node -- shared between ObjectNode & CollectionNode */



function Node( app , children = {} ) {
	this.app = app ;
	this.children = children ;
}

module.exports = Node ;



/*
	Common context object (get/post/put/patch/delete):

		* performer
		* parentNode
		* ancestorObjectNodes
		* query (optional)
*/



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.get = function( pathParts , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'get' ,
		pathParts: pathParts ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	if ( ! context.input.access ) {
		context.input.access = [ 'id' , 'content' ] ;
	}
	else if ( context.input.access === true || context.input.access === 'all' ) {
		context.input.access = true ;
	}
	else if ( ! Array.isArray( context.input.access ) ) {
		context.input.access = [ context.input.access ] ;
	}


	if ( ! context.input.pAccess ) {
		context.input.pAccess = [ 'id' , 'content' ] ;
	}
	else if ( context.input.pAccess === true || context.input.pAccess === 'all' ) {
		context.input.pAccess = true ;
	}
	else if ( ! Array.isArray( context.input.pAccess ) ) {
		context.input.pAccess = [ context.input.pAccess ] ;
	}

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._get( pathParts , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.post = function( pathParts , incomingDocument , attachmentStreams , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
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

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._post( pathParts , incomingDocument , attachmentStreams , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.put = function( pathParts , incomingDocument , attachmentStreams , context = {} ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
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

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._put( pathParts , incomingDocument , attachmentStreams , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.patch = function( pathParts , incomingDocument , attachmentStreams , context ) {
	// Check empty patch
	if ( ! attachmentStreams ) {
		let empty = true ;

		for ( let k in incomingDocument ) { empty = false ; break ; } // eslint-disable-line no-unused-vars

		if ( empty ) {
			return Promise.resolve( ErrorStatus.badRequest( 'Empty patch' ) ) ;
		}
	}

	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
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

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._patch( pathParts , incomingDocument , attachmentStreams , context ) ;
} ;



// Only take care of arguments management and out of recursivity stuff, then pass control to the real function
Node.prototype.delete = function( pathParts , context ) {
	if ( ! Array.isArray( pathParts ) ) {
		try {
			pathParts = restQuery.path.parse( pathParts ) ;
		}
		catch ( error ) {
			return Promise.reject( error ) ;
		}
	}

	if ( ! context.output ) { context.output = {} ; }

	context.input = {
		method: 'delete' ,
		pathParts: pathParts ,
		query: context.query || ( context.input && context.input.query ) || {} ,
		performer: context.performer || ( context.input && context.input.performer ) || this.app.createPerformer( null , true )
	} ;

	// 'alter' contains alteration during the traversal, e.g. alteration of the schema... does not survive links.
	context.alter = {} ;

	return this._delete( pathParts , context ) ;
} ;



// autoSlugId: the current collection will be assumed if a slugId is given
Node.prototype.contains = function( collectionNode , autoSlugId ) {
	if ( ! ( collectionNode instanceof restQuery.CollectionNode ) ) { throw new Error( '[restQuery] .constains() require argument #0 to be an instance of restQuery.CollectionNode' ) ; }

	// First check the child name
	if ( this.children[ collectionNode.name ] ) {
		// This is not an error ATM, since contains() is called by the tree, and an element can be in many place of it.
		// So just return, doing nothing.
		//throw new Error( '[restQuery] Cannot attach over an existing child: ' + this.children[ collectionNode.name ] ) ;
		return ;
	}

	this.children[ collectionNode.name ] = collectionNode ;

	//return rootsDb.collection ;
} ;



// It modify a patch, by prefixing each entry
Node.prefixPatchDocument = function( patchDocument , prefix ) {
	var key , prefixed = {} ;

	prefix += '.' ;

	for ( key in patchDocument ) {
		prefixed[ prefix + key ] = patchDocument[ key ] ;
	}

	return prefixed ;
} ;



// Transform common internal errors to user errors, if it is...
Node.transformError =
Node.prototype.transformError = function( error ) {
	if ( error.validatorMessage ) {
		return ErrorStatus.badRequest( {
			message: "Document not validated: " + error.validatorMessage ,
			at: error.at ,
			stack: error.stack
		} ) ;
	}

	return error ;
} ;



// /!\ TODO... /!\
// ----------------------------------------------------------- CLEAN UP -----------------------------------------
Node.parseQuery = function( query_ ) {
	var query = {} ;

	if ( query_.populate ) {
		query.populate = query_.populate ;
	}

	if ( query_.skip ) {
		query.skip = parseInt( query_.skip , 10 ) ;
	}

	if ( query_.limit ) {
		query.limit = parseInt( query_.limit , 10 ) ;
	}

	// Force a limit
	if ( ! query.limit || query.limit > 1000 ) {
		query.limit = 1000 ;
	}

	if ( query_.sort ) {

		query.sort = query_.sort ;

		/*
			/!\ Sort should only be available on indexed fields
		*/
		for ( let k in query.sort ) {
			query.sort[ k ] = parseInt( query.sort[ k ] , 10 ) ;
		}
	}

	if ( query_.filter ) {
		query.filter = query_.filter ;

		/*
			/!\ For instance, we forbid *ALL* top-level operators

			Operators that will be supported:
				- comparison: $in, $nin, $gt, $gte, $lt, $lte, $eq, $ne
				- maybe evaluation: $regex, $text, $mod
		*/
		for ( let k in query.filter ) {
			if ( k[ 0 ] === '$' ) {
				delete query.filter ;
				break ;
			}
			/*
			else if ( query.filter[ k ] && typeof query.filter[ k ] === 'object' ) {
				for ( let k2 in query.filter[ k ] ) {
					if ( k2[ 0 ] === '$' ) { delete query.filter[ k ][ k2 ] ; }
				}
			}
			*/
		}
	}

	return query ;
} ;



// TODO...
// /!\ Should check if populate field is OK.
// /!\ Don't know if the whole "populate security model" should be checked here, or if this is just an anti-WTF filter.
// /!\ check if the populated value is authorized by the current accessTags (avoid unecessary server computing)
Node.prototype.checkPopulate = function( populate ) {
	// TODO...
	if ( populate && ! Array.isArray( populate ) ) { populate = [ populate ] ; }
	return populate ;
} ;



// Node.checkOneAccess( string , Array , Set )
Node.checkOneAccess = function( accessType , grantedAccess , requiredAccess ) {
	var i , iMax ;

	// This works with booleans
	// true means *ALL* access in both grantedAccess and requiredAccess
	if ( requiredAccess === true ) { return grantedAccess === true ; }

	if ( ! requiredAccess.size ) { return true ; }
	if ( ! grantedAccess ) { return false ; }

	for ( i = 0 , iMax = grantedAccess.length ; i < iMax ; i ++ ) {
		if ( requiredAccess.delete( grantedAccess[ i ] ) && ! requiredAccess.size ) { return true ; }
	}

	return false ;
} ;



// Check access on an object
Node.checkAccess = async function( performer , accessType , requiredAccess , collectionNode , object , ancestorObjectNodes ) {
	var k , i , iMax , j , jMax , depth ,
		user , userId , groups , groupId ,
		publicAccess , userAccess , groupAccess ,
		hasUserAccess , hasGroupAccess , hasUserAccessInheritance , hasGroupAccessInheritance ;

	log.fatal( "Check access %s %Y" , accessType , requiredAccess ) ;
	//console.log( "object:" , object ) ;
	//console.log( "ancestors:" , ancestorObjectNodes ) ;


	// Access granted: "system" is always right!
	if ( performer.system ) {
		log.fatal( 'Granted: "system" is always right' ) ;
		return ;
	}

	if ( ! requiredAccess ) { return true ; }

	if ( typeof requiredAccess === 'object' ) {
		// We create a fresh Set, because we will remove items each times accesses are granted
		requiredAccess = new Set( requiredAccess ) ;
	}

	/*
		Tmp? Should this test be done elsewhere, at collection traversing time?
		That complicated, since we cannot predict which kind of access is needed.
		E.g. PUT /Users/[id] can be either a create or a modify, we only now after checking the DB for the ID,
		POST has different meaning as well.
	*/
	// Access denied by collection's 'restrictAccess'
	/*
	if ( collectionNode && collectionNode.restrictAccess && Node.checkOneAccess( accessType , collectionNode.restrictAccess[ accessType ] , requiredAccess ) ) {
		log.fatal( "Denied by collection restrictAccess: %J" , collectionNode.restrictAccess ) ;
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}
	//*/


	// Access granted by 'publicAccess'
	if ( Node.checkOneAccess( accessType , object.publicAccess[ accessType ] , requiredAccess ) ) {
		log.fatal( "Granted by publicAccess: %J" , object.publicAccess ) ;
		return ;
	}


	// Check if there is at least one userAccess and one groupAccess
	for ( k in object.userAccess ) { hasUserAccess = true ; break ; }
	for ( k in object.groupAccess ) { hasGroupAccess = true ; break ; }


	// Check if some ancestors have inheritance
	for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ ) {
		depth = i + 1 ;
		publicAccess = ancestorObjectNodes[ i ].object.publicAccess ;

		// Access granted by inherited 'publicAccess'
		if (
			publicAccess.inheritance &&
			publicAccess.inheritance.depth >= depth &&
			Node.checkOneAccess( accessType , publicAccess.inheritance[ accessType ] , requiredAccess )
		) {
			log.fatal( "Granted by inherited publicAccess: %J" , publicAccess ) ;
			return ;
		}

		userAccess = ancestorObjectNodes[ i ].object.userAccess ;
		for ( k in userAccess ) {
			if ( userAccess[ k ].inheritance && userAccess[ k ].inheritance.depth >= depth ) {
				hasUserAccessInheritance = true ;
				break ;
			}
		}

		groupAccess = ancestorObjectNodes[ i ].object.groupAccess ;
		for ( k in groupAccess ) {
			if ( groupAccess[ k ].inheritance && groupAccess[ k ].inheritance.depth >= depth ) {
				hasGroupAccessInheritance = true ;
				break ;
			}
		}
	}

	// Quickly exit if no particular access exists on this resource
	if ( ! hasUserAccess && ! hasGroupAccess && ! hasUserAccessInheritance && ! hasGroupAccessInheritance ) {
		log.fatal( "Denied: no public access, and no user and group access defined: %J" , object.publicAccess ) ;
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}



	try {
		user = await performer.getUser() ;
	}
	catch ( error ) {
		log.fatal( "Denied by performer error: %E" , error ) ;
		throw error ;
	}

	// Access denied, performer should be connected
	if ( ! user ) {
		log.fatal( "Denied: no public access and not connected" ) ;
		throw ErrorStatus.unauthorized( "Public access forbidden." ) ;
	}

	userId = user.getId().toString() ;

	// Access granted by 'userAccess'
	if ( userId in object.userAccess && Node.checkOneAccess( accessType , object.userAccess[ userId ][ accessType ] , requiredAccess ) ) {
		log.fatal( "Granted by userAccess: %J" , object.userAccess[ userId ] ) ;
		return ;
	}

	// Access granted by inherited 'userAccess'
	if ( hasUserAccessInheritance ) {
		for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ ) {
			depth = i + 1 ;
			userAccess = ancestorObjectNodes[ i ].object.userAccess ;

			if (
				userId in userAccess &&
				userAccess[ userId ].inheritance &&
				userAccess[ userId ].inheritance.depth >= depth &&
				Node.checkOneAccess( accessType , userAccess[ userId ].inheritance[ accessType ] , requiredAccess )
			) {
				log.fatal( "Granted by inherited userAccess: %J" , userAccess[ userId ] ) ;
				return ;
			}
		}
	}


	// Quickly exit if no group access exist on this resource
	if ( ! hasGroupAccess && ! hasGroupAccessInheritance ) {
		log.fatal( "Denied: no public and user access and no group defined" ) ;
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}


	groups = await performer.getGroups() ;
	//log.error( "Groups: %Y" , groups ) ;

	// Check each group of the user
	for ( j = 0 , jMax = groups.length ; j < jMax ; j ++ ) {
		groupId = groups[ j ].getKey() ;
		//console.log( "Checking group: " , groupId ) ;

		// Access granted by 'groupAccess'
		if ( groupId in object.groupAccess && Node.checkOneAccess( accessType , object.groupAccess[ groupId ][ accessType ] , requiredAccess ) ) {
			log.fatal( "Granted by groupAccess: %J" , object.groupAccess[ groupId ] ) ;
			return ;
		}

		// Access granted by inherited 'groupAccess'
		if ( hasGroupAccessInheritance ) {
			for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ ) {
				depth = i + 1 ;
				groupAccess = ancestorObjectNodes[ i ].object.groupAccess ;

				if (
					groupId in groupAccess &&
					groupAccess[ groupId ].inheritance &&
					groupAccess[ groupId ].inheritance.depth >= depth &&
					Node.checkOneAccess( accessType , groupAccess[ groupId ].inheritance[ accessType ] , requiredAccess )
				) {
					log.fatal( "Granted by inherited groupAccess: %J" , groupAccess[ groupId ] ) ;
					return ;
				}
			}
		}
	}


	// Nothing has granted access to this connected performer, so access is denied
	log.fatal( "Denied: all potential grant sources have been exhausted without success" ) ;
	throw ErrorStatus.forbidden( "Access forbidden." ) ;
} ;



// Check access on an object
Node.getAllAccessTags = async function( performer , accessType , collectionNode , object , ancestorObjectNodes ) {
	var k , i , iMax , j , jMax , depth ,
		user , userId , groups , groupId ,
		publicAccess , userAccess , groupAccess ,
		accessTags = new Set() ,
		hasUserAccess , hasGroupAccess , hasUserAccessInheritance , hasGroupAccessInheritance ;

	log.fatal( "Get all access tags %s" , accessType ) ;
	//console.log( "object:" , object ) ;
	//console.log( "ancestors:" , ancestorObjectNodes ) ;


	// Access granted: "system" is always right!
	if ( performer.system ) {
		log.fatal( 'Get all access -- granted: "system" is always right' ) ;
		return true ;
	}


	/*
		Tmp? Should this test be done elsewhere, at collection traversing time?
		That complicated, since we cannot predict which kind of access is needed.
		E.g. PUT /Users/[id] can be either a create or a modify, we only now after checking the DB for the ID,
		POST has different meaning as well.
	*/
	// Access denied by collection's 'restrictAccess'
	/*
	if ( collectionNode && collectionNode.restrictAccess && Node.checkOneAccess( accessType , collectionNode.restrictAccess[ accessType ] , requiredAccess ) ) {
		log.fatal( "Denied by collection restrictAccess: %J" , collectionNode.restrictAccess ) ;
		throw ErrorStatus.forbidden( "Access forbidden." ) ;
	}
	//*/


	// Access granted by 'publicAccess'
	if ( object.publicAccess[ accessType ] ) {
		// All right granted?
		if ( object.publicAccess[ accessType ] === true ) { return true ; }
		object.publicAccess[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
		log.fatal( "After publicAccess: %J" , accessTags ) ;
	}


	// Check if there is at least one userAccess and one groupAccess
	for ( k in object.userAccess ) { hasUserAccess = true ; break ; }
	for ( k in object.groupAccess ) { hasGroupAccess = true ; break ; }


	// Check if some ancestors have inheritance
	for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ ) {
		depth = i + 1 ;
		publicAccess = ancestorObjectNodes[ i ].object.publicAccess ;

		// Access granted by inherited 'publicAccess'
		if ( publicAccess.inheritance && publicAccess.inheritance.depth >= depth ) {
			if ( publicAccess.inheritance[ accessType ] === true ) { return true ; }
			publicAccess.inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
			log.fatal( "After inherited publicAccess: %J" , accessTags ) ;
		}

		userAccess = ancestorObjectNodes[ i ].object.userAccess ;
		for ( k in userAccess ) {
			if ( userAccess[ k ].inheritance && userAccess[ k ].inheritance.depth >= depth ) {
				hasUserAccessInheritance = true ;
				break ;
			}
		}

		groupAccess = ancestorObjectNodes[ i ].object.groupAccess ;
		for ( k in groupAccess ) {
			if ( groupAccess[ k ].inheritance && groupAccess[ k ].inheritance.depth >= depth ) {
				hasGroupAccessInheritance = true ;
				break ;
			}
		}
	}

	// Quickly exit if no particular access exists on this resource
	if ( ! hasUserAccess && ! hasGroupAccess && ! hasUserAccessInheritance && ! hasGroupAccessInheritance ) {
		return accessTags ;
	}



	try {
		user = await performer.getUser() ;
	}
	catch ( error ) {
		log.fatal( "Denied by performer error: %E" , error ) ;
		//throw error ;
		return accessTags ;
	}

	// Access denied, performer should be connected
	if ( ! user ) { return accessTags ; }

	userId = user.getId().toString() ;

	// Access granted by 'userAccess'
	if ( object.userAccess[ userId ] && object.userAccess[ userId ][ accessType ] ) {
		if ( object.userAccess[ userId ][ accessType ] === true ) { return true ; }
		object.userAccess[ userId ][ accessType ].forEach( tag => accessTags.add( tag ) ) ;
		log.fatal( "After userAccess: %J" , accessTags ) ;
	}

	// Access granted by inherited 'userAccess'
	if ( hasUserAccessInheritance ) {
		for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ ) {
			depth = i + 1 ;
			userAccess = ancestorObjectNodes[ i ].object.userAccess ;

			if ( userAccess[ userId ] &&
				userAccess[ userId ].inheritance && userAccess[ userId ].inheritance.depth >= depth &&
				userAccess[ userId ].inheritance[ accessType ]
			) {
				if ( userAccess[ userId ].inheritance[ accessType ] === true ) { return true ; }
				userAccess[ userId ].inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
				log.fatal( "After inherited userAccess: %J" , accessTags ) ;
			}
		}
	}


	// Quickly exit if no group access exist on this resource
	if ( ! hasGroupAccess && ! hasGroupAccessInheritance ) { return accessTags ; }


	groups = await performer.getGroups() ;
	//log.error( "Groups: %Y" , groups ) ;

	// Check each group of the user
	for ( j = 0 , jMax = groups.length ; j < jMax ; j ++ ) {
		groupId = groups[ j ].getKey() ;
		//console.log( "Checking group: " , groupId ) ;

		// Access granted by 'groupAccess'
		if ( object.groupAccess[ groupId ] && object.groupAccess[ groupId ][ accessType ] ) {
			if ( object.groupAccess[ groupId ][ accessType ] ) { return true ; }
			object.groupAccess[ groupId ][ accessType ].forEach( tag => accessTags.add( tag ) ) ;
			log.fatal( "After groupAccess: %J" , accessTags ) ;
		}

		// Access granted by inherited 'groupAccess'
		if ( hasGroupAccessInheritance ) {
			for ( i = 0 , iMax = ancestorObjectNodes.length ; i < iMax ; i ++ ) {
				depth = i + 1 ;
				groupAccess = ancestorObjectNodes[ i ].object.groupAccess ;

				if ( groupAccess[ groupId ] &&
					groupAccess[ groupId ].inheritance && groupAccess[ groupId ].inheritance.depth >= depth &&
					groupAccess[ groupId ].inheritance[ accessType ]
				) {
					if ( groupAccess[ groupId ].inheritance[ accessType ] === true ) { return true ; }
					groupAccess[ groupId ].inheritance[ accessType ].forEach( tag => accessTags.add( tag ) ) ;
					log.fatal( "After inherited groupAccess: %J" , accessTags ) ;
				}
			}
		}
	}

	return accessTags ;
} ;

