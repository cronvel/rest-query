
## Manage Access Rights

The access of any document/object/method in RestQuery require that the end-user has the correct rights.



### Debug and Dev: Grant All Accesses

To allow all accesses on any document/object/method, there are 2 conditions:

* the RestQuery service should be started with the `--debug-grant` option
* the HTTP request should add the header `X-Grant: true`



### Types of access right

#### Traverse

The *traverse* right allows an object node to be traversed, giving access to the child nodes, even if proper access
to the current node is forbidden.

The *traverse* right is a boolean.



#### Read

The *read* right allows part of an object to be read.

The *read* right is either a boolean (true: give read-access to all tags, false: no access to the object)
or an array of tags allowed for reading.



#### Write

The *write* right allows part of an **existing** object to be modified, updated.
This doesn't allow: creation of a new document/object, replacing a whole document by a new one.

The *write* right is either a boolean (true: give write-access to all tags, false: forbid any modification of the node)
or an array of tags allowed for modification.



#### Overwrite

The *overwrite* right allows an object to be overwritten by a new one, i.e. to be replaced entirely.

The *overwrite* right is a boolean.



#### Delete

The *delete* right allows an object to be deleted.

The *delete* right is a boolean.



#### Create

The *create* right allows new objects to be created.
As such, it should be set on the **parent** object (or on the *root-object*, if needed).

The *create* right is a boolean.



#### Exec

The *exec* right allows methods to be called/executed on the current node.

The *exec* right is either a boolean (true: give execution right to all methods, false: forbid any method call)
or an array of tags allowed for execution.



#### Query

The *query* right allows listing and querying of children of the object.

The *query* right is a boolean.



### Setting access for users

Accesses are always set on **documents/objects**.
Alternatively, it is possible to set the property `defaultPublicAccess` directly on the schema of a collection,
it will replaces any missing `publicAccess` property on a document.

It is possible, and most of time desirable, to leverage most of the user's rights using the special *root-object* node,
through the inheritance mecanism.

There are three generic ways of giving accesses:

* giving public accesses (giving accesses any user, even non-connected one)
* giving user accesses
* giving group accesses (to all users of a group)

The first source of rights providing an access will be used.
So the each source can only grant more accesses, not restrict accesses.

E.g.: it means that a user cannot have less accesses that public accesses, or less accesses than the one provided by its groups,
and so on.



#### Public access

Setting public access on an object give minimal accesses to **ANY consumer, even non-connected one**.

On the document, the property is named `publicAccess`, and contains an *access* object.



#### User access

It is possible to give specific accesses for specific users.
The user's ID must be known.

On the document, the property is named `userAccess`, and is an object having user's IDs as keys and
*access* sub-objects as values.



#### Group access

It is possible to give specific accesses for all users that are part of a group.
The group's ID must be known.

On the document, the property is named `groupAccess`, and is an object having group's IDs as keys and
*access* sub-objects as values.



### Access sub-object

Inside a document/object, various access sub-objects can be present (inside `publicAccess`, `userAccess.<userID>`
or `groupAccess.<groupID>`).

All properties for that sub-object are optional.

That sub-object may contain properties for each access type: `traverse`, `read`, `write`, `overwrite`, `delete`,
`create`, `exec`, `query`.
Those properties contains either booleans or list of tags (see access-type for details).

It may contain `inheritance` property, which is an object that may contain all access types (`traverse`, `read`,
`write`, `overwrite`, `delete`,`create`, `exec`, `query`) and a `depth` property which is an *integer* (default: 1)
used  to restrict the number of level of that inheritance.
Inheritance is used to give accesses on children-nodes of the current node.

It could also contain a `collections` property, which is an object with keys being a collection's name and values being
a *collection access* sub-object, that contains access rights to a child collection node instead of the access rights
to the current object.
A *collection access* sub-object is similar to an *access* sub-object except that there are only those access
types: `traverse`, `create`, `exec`, `query` (other access types are meaningless on a collection node).
It also supports the `inheritance` property, to provide access to children-objects of the current node only if they are
part of that child-collection.



### Querying a document with access tags

While performing the HTTP request, choosing with parts of the document to retrieve is done by providing the list of tags
to the *access* property of the query-string.
If no *access* property is given, RestQuery always assumes *id*, *content* and *system-content*.

Example of query-string: `&access=id,content,someUserTag`.

Special values:

* *all*: query all existing tags
* *all-granted*: query all existing AND allowed tags


