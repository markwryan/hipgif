# Release notes for Atlassian Connect Express

### 1.0.1

* Explicit support for multipart form data and url-encoded form data: A bug caused some multipart form uploads (e.g. 
for JIRA attachments) to fail. The ambiguous `options.form` parameter for HTTP requests back to the product host is now deprecated.
Please use these parameters instead:
    * `multipart/form-data`: Use `options.multipartFormData`
    * `application/x-www-form-urlencoded`: Use `options.urlEncodedFormData`

### 1.0.0-beta5

* The token mechanism for iframe to add-on service communication is using JWT now. The old token mechanism continues to
work, but is deprecated. Please see the updated [README.md](README.md) for details.

* __Breaking Change__: We removed support for sessions in ACE, in favor of the standard JWT token approach. 
If your code relies on `req.session.*`, you will need to change that to `req.context.*` or `res.locals.*`.