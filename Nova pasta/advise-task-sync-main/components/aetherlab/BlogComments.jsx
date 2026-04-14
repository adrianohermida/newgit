import React from 'react';
import { COLORS, TYPOGRAPHY } from './theme/ThemeConfig';

export default function BlogComments({ 
  title = "Comentários",
  comments = []
}) {
  return (
    <section
      style={{
        marginTop: '80px'
      }}
      className="md:mt-[60px] xs:mt-[40px]"
    >
      <h3
        style={{
          fontSize: '20px',
          fontWeight: TYPOGRAPHY.weights.bold,
          marginBottom: '30px',
          position: 'relative',
          zIndex: 1,
          textTransform: 'capitalize',
          fontFamily: TYPOGRAPHY.fontFamily,
          color: COLORS.black,
          margin: '0 0 30px 0'
        }}
        className="xs:text-[18px]"
      >
        {title}
      </h3>

      <ul
        style={{
          listStyle: 'none',
          padding: '0',
          margin: '0'
        }}
      >
        {comments.map((comment, idx) => (
          <li
            key={idx}
            style={{
              paddingLeft: '110px',
              position: 'relative',
              fontSize: '15px',
              borderRadius: '8px',
              marginTop: '50px'
            }}
            className="xs:p-0 xs:mt-[35px]"
          >
            {/* Avatar */}
            {comment.avatar && (
              <div
                style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '80px',
                  height: '80px'
                }}
                className="xs:relative xs:top-auto xs:left-auto xs:mb-[18px]"
              >
                <img
                  src={comment.avatar}
                  alt={comment.name}
                  style={{
                    maxWidth: '80px',
                    maxHeight: '80px',
                    borderRadius: '50%',
                    display: 'block'
                  }}
                />
              </div>
            )}

            {/* Comment Content */}
            <div style={{ position: 'relative' }}>
              {/* Header */}
              <div style={{ marginBottom: '20px', position: 'relative', display: 'block' }}>
                <h6
                  style={{
                    fontSize: '16px',
                    marginBottom: '8px',
                    fontWeight: '600',
                    fontFamily: TYPOGRAPHY.fontFamily,
                    color: COLORS.black,
                    margin: '0 0 8px 0'
                  }}
                >
                  {comment.name}
                </h6>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: '400',
                    color: COLORS.text.body
                  }}
                  className="xs:block"
                >
                  {comment.date}
                </span>

                {/* Reply Link */}
                {comment.replyLink && (
                  <a
                    href={comment.replyLink}
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '0',
                      display: 'inline-block',
                      fontSize: '14px',
                      fontWeight: '500',
                      zIndex: 2,
                      color: COLORS.black,
                      textDecoration: 'none',
                      transition: 'color 0.3s ease'
                    }}
                    className="xs:relative xs:top-auto xs:right-auto xs:mt-[15px]"
                    onMouseEnter={(e) => e.target.style.color = COLORS.primary}
                    onMouseLeave={(e) => e.target.style.color = COLORS.black}
                  >
                    Responder
                  </a>
                )}
              </div>

              {/* Comment Text */}
              <p
                style={{
                  fontWeight: '400',
                  marginBottom: '0',
                  fontSize: '15px',
                  color: COLORS.text.body,
                  fontFamily: TYPOGRAPHY.fontFamily
                }}
                className="xs:mt-[20px]"
              >
                {comment.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}