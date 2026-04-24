import Head from "next/head";
import Layout from "../../components/Layout";
import { getPublishedBlogPostBySlug, getPublishedBlogPosts } from "../../lib/blog/posts";

function renderParagraphs(content) {
  return String(content || "")
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function BlogPostPage({ post }) {
  if (!post) {
    return (
      <Layout>
        <article className="pt-32 pb-24">
          <div className="mx-auto max-w-4xl px-6">
            <div
              className="rounded-sm px-6 py-8 text-sm leading-relaxed opacity-70"
              style={{ border: "1px solid #2D2E2E", background: "rgba(18, 18, 18, 0.35)" }}
            >
              Este artigo nao esta disponivel no momento.
            </div>
          </div>
        </article>
      </Layout>
    );
  }

  const paragraphs = renderParagraphs(post.content);

  return (
    <Layout>
      <Head>
        <title>{post.seoTitle}</title>
        <meta name="description" content={post.seoDescription} />
      </Head>

      <article className="pt-32 pb-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                {post.category}
              </span>
              <span className="w-1 h-1 rounded-full" style={{ background: "#2D2E2E" }} />
              <time
                className="text-[10px] font-semibold tracking-[0.15em] uppercase opacity-30"
                dateTime={post.isoDate || undefined}
              >
                {post.date}
              </time>
            </div>

            <h1 className="font-serif text-4xl md:text-6xl font-light mb-6" style={{ color: "#F4F1EA" }}>
              {post.title}
            </h1>
            <p className="text-base md:text-lg leading-relaxed opacity-70 max-w-3xl">{post.excerpt}</p>
          </div>

          {post.image && (
            <div className="aspect-[16/9] overflow-hidden mb-12" style={{ border: "1px solid #2D2E2E" }}>
              <img
                src={post.image}
                alt={post.title}
                className="h-full w-full object-cover"
                style={{ filter: "brightness(0.6) contrast(1.05)" }}
              />
            </div>
          )}

          <div className="space-y-6 text-base leading-8 opacity-90">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </div>
      </article>
    </Layout>
  );
}

export async function getStaticPaths() {
  const posts = await getPublishedBlogPosts();
  const safePosts = Array.isArray(posts) ? posts : [];

  return {
    paths: safePosts.map((post) => ({ params: { slug: post.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const post = await getPublishedBlogPostBySlug(params.slug);

  if (!post) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      post,
    },
  };
}
