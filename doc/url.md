


# Methods overview

* GET: *retrieve* an object or a collection of objects
* PUT: *create* or *update* (overwrite) an object in the collection, the object is placed at the exact place
  in the provided URI, with the exact ID provided, except if it violate uniqueness, if an object exists, 
  it is replaced entirely by the new object.
* PATCH: *update* partially, update only parts of the object present in the patch body
* DELETE: *delete* the object (or the collection, if possible)
* POST:
	* *create* an object on the collection 
	* execute a method of a collection, e.g. `POST /Users/CREATE-TOKEN` will authenticate the user with {ID} as ID
	* execute a method of a document, e.g. `POST /Users/{id}/SOME-METHOD` will execute `someMethod()` of the user (document)
	* POST always indicate something that cannot be done offline.



# Path

The path is splitted into parts, a.k.a. *node*.

E.g.: /Users/bob/POKE would be splitted into:

	- Users
	- bob
	- POKE

Each node as type. A node type is determinist: just by looking at the string we know for sure what type of node it is.



# Path's Node types

* Collection node: start with an upper-case letter, and followed by a low-case letter, followed by any alpha-numeric characters
  (both low and upper case). A collection is a batch of documents.
  Its name is converted into camelCase (first letter is lowercased) to match a database collection/table and a schema.
  E.g.: `Users` is a collection of `users` (schema) store in the collection/table `users` in the database

* ID node: contains 24 characters of hexadecimal, hexadecimal letters MUST BE low-case. This is the ID of a document,
  that is parts of the parent Collection.
  IDs are unique in a Collection node, and in the related database collection/table.
  E.g.: `1234a6789f123ed6789012cb`.

* SlugId node: only contains lowercased letters, numbers and hyphen (-). This is a human readable identifier.
  SlugIds are unique among their siblings.
  E.g.: `my-wonderful-blog`.

* Method node: only contains upper case letters, numbers and hyphen, and should start with 2 upper case letters.
  Its name converted to camelCase is used to execute a special methods on a collection or a document, and could only be used
  with the POST method.
  E.g.: `CREATE-TOKEN` execute the method `createToken()` on its parent node.

* Property node: start with a dot '.' and followed by any alpha-numeric characters. This is a property of the parent document.
  Its name is converted by simply removing the first dot, the following exactly matches the property name of a document.
  E.g.: `.title` returns the property `title` of the parent document.
  It is possible to join adjacent property node into only one node, e.g.: `.meta/.tags` can be joined into `.meta.tags`,
  assuming `meta` is a nested object of the parent document, and `tags` a property of `meta`.

* Link node: start with a tilde '~' and followed by any alpha-numeric characters. This is document linked by the parent document.
  Its name is converted by simply removing the tilde, the following exactly matches a property name of the parent document,
  which is a link. The link node returns the linked document.
  E.g.: `~avatar` returns a document linked by the parent document under the `avatar` property name.

* Multi-Link node: start with a double tilde '~~' and followed by any alpha-numeric characters. This is collection linked
  by the parent document.
  Its name is converted by simply removing the double tilde, the following exactly matches a property name of the parent document,
  which is a multi-link. The multi-link node returns a batch of documents.
  E.g.: `~~friends` returns a batch of documents linked by the parent document under the `friends` property name.

Examples:

* `GET /Users`: get a batch (an array) of all `users`
* `GET /Users/1234a6789f123ed6789012cb`: get a user of the `users` database collection/table whose ID is `1234a6789f123ed6789012cb`
* `GET /Organizations/soulserv/Users`: get a batch (an array) of `users` that belong to an organization whose slugId is `soulserv`
* `POST /Users/CREATE-TOKEN`: execute the method `createToken()` of the collection `users`
* `GET /Users/bob/~~friends`: get all friends (an array of documents) of the user whose slugId is `bob`
* `GET /Users/bob/~~friends/jenny`: get a document (here probably a user) whose slugId is `jenny`, which is a friend of the user `bob`



# Pattern matching

Path pattern are path that contains wildcards. All wildcards start with an opening braces and end with a closing brace.

E.g.: `/Users/{id}` is a pattern that matches all path consisting in a `Users` collection node and any ID node type.

List of wildcards:

* `{id}`: match any node of the ID type
* `{slugId}`: match any node of the slugId type
* `{document}`: match any node of the ID or slugId type
* `{collection}`: match any node of the Collection type
* `{*}`: match any node.
* `{...}`: match zero, one, or multiple adjacent nodes at once. A pattern cannot use more than one wildcard of this type.

E.g.: `/Users/{document}/{...}` will match:
* `/Users/123456789012345678901234`
* `/Users/bob`
* `/Users/123456789012345678901234/~~friends`
* `/Users/bob/~avatar`

A context object may be passed to the pattern-matcher. The pattern can refer to it a markup starting with `$`, producing
markup like: `{$path.to.some.property}`.

E.g.: assuming we got a this context object:

```
{
	connectedUser: {
		id: "123456789012345678901234",
		firstName: "Bob",
		slugId: "bob"
	}
}
```

... then the pattern `/Users/{$connectedUser.id}/~avatar` will match `/Users/123456789012345678901234/~avatar`.



# URL parsing

Each parts of the URL's path can be one the following:
* if it starts with an uppercased letter followed by a lowercased letter, it is a child collection of the parent object
  (it converts to the regular camelCase collection name), following this scheme: [A-Z][a-z][a-zA-Z0-9]*
* if it starts with two uppercased letters, it is method the parent object (it converts to the regular camelCase method name),
  following this scheme: [A-Z][A-Z][A-Z0-9-]*
* if it is a 24 characters string of hexadecimal (using lowercased letter), it is an ID
* if it is a string containing only character of the class `[0-9a-z-]`, it is a SID
* if it contains only decimal, it is an *offset* (the index of the element into the collection)
* anything else is an error



# SID (Slug ID)

This is a human-readable ID, both intended to make user-friendly and SEO-friendly URL.
Also, a user's account identifier is a SID (rather than an email), this is consistent with Twitter @ syntaxe.

Requirement
* a SID is a string, and should at least contains 1 characters, and at most 72 characters
* allowed character are lowcase ascii alpha (a-z), digits (0-9) and hyphen (-)
* if the string happens to be a valid ID or a valid decimal arbitrary number, then either an hyphen `-` is appended to transform it,
  or the SID creation is simply rejected



# MongoID's client-side creation

The original MongoID are built this way:

	Each MongoId is 12 bytes (making its string form 24 hexidecimal characters):
	* 4 bytes for a timestamp
	* 3 bytes are a hash of the client machine's hostname
	* 2 bytes for the two least significant bytes of the process id running the script
	* 3 bytes are an incrementing value

When creating a MongoID client-side, the 5 bytes `shortAgentID` is used as a replacement for the 2 middle part of the ID.

To sum up, the 12 bytes are built this way:
* 4 bytes for a client-side timestamp
* 5 bytes for the client's `shortAgentID`
* 3 bytes are a client-side incrementing value

Across any REST query, ID are sent in hexadecimal-encoded string, being in the URI part or in the JSON body, or anything else.



# MongoDB collections and documents requirement

## Special collection: agents

Collection's methods:
* create (POST) : create a new agent object, and return it

Object's data:
* _id (agentID) `MongoID` 12 bytes, generated by the auth server
* shortAgentID `Hexadecimal` 5 bytes/10 chars hash of the Agent-ID, it **\*MUST\*** be unique, also it could be quite difficult to enforce
  uniqness in a sharded environment
* key `String` a key used for the agent authentication
* lastConnection `Date` the last connection performed by this agent
* userAgent `String` the HTTP `User-Agent` header string of this agent
* meta `Object` specific application-side data are stored here

Object's methods:
* auth (POST) : authenticate an agent



## Special collection: users

Collection's methods:
* create (POST) : create a new user object, and return it

Object's data:
* _id (userID) `MongoID` 12 bytes, generated by the auth server
* SID `SID` here the SID is unique among all users
* email `Email` a valid email where the user can be reached (unique or not?)
* passwordHash `String` hash of the user password
* lastConnection `Date` the last connection performed by this agent

Object's methods:
* auth (POST) : authenticate an user



## Special collection: auth

Object's data:
* _id `MongoID`
* collection `String` collection's name for this auth entry
* userID `MongoID` the ID of the related user
* objectID `MongoID` the ID of the object in the collection



## Common properties of all application's collections

Object's data:
* SID `SID` (optionnal) Slug ID, sometime unique, sometime only unique on the current path's directory
* title `String` full featured title for this resource, most of time this property is used to create automatically a SID



