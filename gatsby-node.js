require('typescript-require');

const _ = require('lodash');
const crypto = require('crypto');
const Promise = require('bluebird');
const path = require('path');
const {createFilePath} = require('gatsby-source-filesystem');


const getTags = (edges) => {
	const tags = [];

	_.each(edges, (edge) => {
		if (_.get(edge, 'node.frontmatter.tags')) {
			for (let i = 0; i < edge.node.frontmatter.tags.length; i++) {
				tags.push(edge.node.frontmatter.tags[i]);
			}
		}
	});

	return tags;
};

const getCategories = (edges) => {
	const categories = [];

	_.each(edges, (edge) => {
		categories.push(edge.node);
	});

	return categories;
};

const slugify = (text) => {
	return text.toString().toLowerCase()
		.replace(/\s+/g, '-')           // Replace spaces with -
		.replace(/[^\w\-]+/g, '')       // Remove all non-word chars
		.replace(/\-\-+/g, '-')         // Replace multiple - with single -
		.replace(/^-+/, '')             // Trim - from start of text
		.replace(/-+$/, '');            // Trim - from end of text
};

exports.createPages = ({graphql, actions}) => {
	const {createPage} = actions;

	return new Promise((resolve, reject) => {
		const postTemplate = path.resolve('./src/templates/post/index.tsx');
		const tagTemplate = path.resolve('./src/templates/tag/index.tsx');
		const categoryTemplate = path.resolve('./src/templates/category/index.tsx');

		resolve(
			graphql(`
				{
					posts: allMarkdownRemark(filter: {fileAbsolutePath: {regex: "//collections/posts//"}}) {
						edges {
							node {
								fields{
									slug
								}
								frontmatter {
									tags
								}
							}
						}
					}
					
					categories: allMarkdownRemark(filter: {fileAbsolutePath: {regex: "//collections/categories//"}}) {
						edges {
							node {
								fields{
									slug
								}
							}
						}
					}
				}
			`).then((result) => {
				if (result.errors) {
					console.error(result.errors);
					reject(result.errors);
				}

				const postsEdges = result.data.posts.edges;
				const categoriesEdges = result.data.categories.edges;

				const tags = getTags(postsEdges);
				const categories = getCategories(categoriesEdges);

				// Create posts and pages.
				_.each(postsEdges, (edge, index) => {
					const slug = edge.node.fields.slug;

					const previous = index === postsEdges.length - 1 ? null : postsEdges[index + 1].node;
					const next = index === 0 ? null : postsEdges[index - 1].node;

					// create posts
					createPage({
						path     : slug,
						component: postTemplate,
						context  : {
							slug,
							previous,
							next,
							tags: edge.node.frontmatter.tags
						}
					});
				});

				// Make tag pages
				_.uniq(tags).forEach((tag) => {
					createPage({
						path     : `/tags/${slugify(tag)}/`,
						component: tagTemplate,
						context  : {
							slug: slugify(tag), tag
						}
					});
				});

				// Make category pages
				_.uniqBy(categories, 'id').forEach((category) => {
					createPage({
						path     : category.fields.slug,
						component: categoryTemplate,
						context  : {
							slug: category.fields.slug
						}
					});
				});
			})
		);
	});
};

const isNodeOfCollection = (node, collection) => node.internal.type === "MarkdownRemark" &&
	node.fileAbsolutePath.match(`collections/${collection}`);

//	Will return only nodes that are from a given collection
const getCollectionNodes = (collection, getNodes) => {
	return getNodes().filter(node => isNodeOfCollection(node, collection)) || [];
};

//	Given a post node, returns the node of the author
const getPostAuthorNode = (postNode, getNodes) => {
	return getCollectionNodes('authors', getNodes).find(node => {
		return node.frontmatter.title === postNode.frontmatter.authors
	});
};

//	Given a post node, returns the node of the category
const getPostCategoryNode = (postNode, getNodes) => {
	return getCollectionNodes('categories', getNodes).find(node => {
		return node.frontmatter.title === postNode.frontmatter.categories
	});
};


const mapCategoriesToPostNode = (node, getNodes) => {
	const category = getPostCategoryNode(node, getNodes);

	//	Netlify CMS does not (yet) support one to many relationships
	//	but we're adding an array to avoid introducing breaking changes
	//	once they do and we have to adapt
	if (category) node.categories___NODES = [category.id];
};

const mapAuthorsToPostNode = (node, getNodes) => {
	const author = getPostAuthorNode(node, getNodes);

	//	Same as above...an array is created
	if (author) node.authors___NODES = [author.id];
};

//	Creates a mapping between posts and authors, sets the slug
//	and other required attributes
exports.sourceNodes = ({actions, getNodes, getNode}) => {
	const {createNodeField} = actions;

	getCollectionNodes('categories', getNodes).forEach(node => {
		createNodeField({node, name: "slug", value: `categories${createFilePath({node, getNode})}`});
	});

	getCollectionNodes('posts', getNodes).forEach(node => {
		mapAuthorsToPostNode(node, getNodes);
		mapCategoriesToPostNode(node, getNodes);
		//	create the post slug
		createNodeField({node, name: "slug", value: `posts${createFilePath({node, getNode})}`});
	});
};

//	Netlify cms fix for netlify deploys?
module.exports.resolvableExtensions = () => ['.json'];
