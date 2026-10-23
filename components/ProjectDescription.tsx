import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ProjectDescription({ text }: { text: string }) {
  return (
    <div className="project-markdown min-w-0 text-sm leading-relaxed">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
