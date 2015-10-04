


Think of a book. Each tier is a part of it.



Tier 0: Identification
======================

This is the cover of the book. Even if we are not allowed to access the content of this book, we can see its cover,
its title and references, eventually the author that has written it.

Those data WILL BE EXPOSED as soon as the user has an access to a document that link them.

A tier 0 request will return document's properties containing identification-only values, e.g.:

* id/_id
* slug
* title
* email/login
* name, firstName, lastName



Tier 1: Summary
===============

This is the summary, the table of content and the introduction of the book.
Yet no real content here.
If one need to "join" data together, most of the time the "summary tier" will be enough.
This would avoid huge result set when retrieving a collection with some populate option.

E.g.:

* meta-data
* tags
* summary
* other links



Tier 2: Content
===============

This is the content of the book.

This is the default tier for a GET request.

E.g.:

* the whole content



Tier 3: Restricted
==================

This tier contains data that would normally be held hidden to regular users.

E.g.:

* RestQuery's user and group accesses
* data that only admins should be aware of



Tier 4: Internals
=================

The last tier contains data that are mostly useful internally.
Some of them are even critical for security.
Even admin are not allowed to modify them directly, only a method can change that.

E.g.:

* RestQuery user's password hash
* RestQuery's cache
* any internal data your app needs
* eventually any highly critical data that only the owner should have access




