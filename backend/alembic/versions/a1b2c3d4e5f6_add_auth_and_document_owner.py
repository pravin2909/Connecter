"""add auth fields and document owner

Adds password hashing to users, token/expiry to sessions, and a user_id owner to
documents so the RAG index can be scoped per user. Existing documents are backfilled to
the local-mode user when it exists.

Revision ID: a1b2c3d4e5f6
Revises: dfd8018f6b82
Create Date: 2026-10-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "dfd8018f6b82"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))

    op.add_column("sessions", sa.Column("token_hash", sa.String(length=64), nullable=True))
    op.add_column("sessions", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_sessions_token_hash"), "sessions", ["token_hash"], unique=True)

    op.add_column("documents", sa.Column("user_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_documents_user_id"), "documents", ["user_id"], unique=False)
    op.create_foreign_key(
        "fk_documents_user_id_users", "documents", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )

    # Backfill existing documents to the local-mode user so single-user installs keep
    # seeing their indexed files after enabling auth.
    op.execute(
        "UPDATE documents SET user_id = (SELECT id FROM users WHERE email = 'local@connecter.ai' LIMIT 1) "
        "WHERE user_id IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_documents_user_id_users", "documents", type_="foreignkey")
    op.drop_index(op.f("ix_documents_user_id"), table_name="documents")
    op.drop_column("documents", "user_id")

    op.drop_index(op.f("ix_sessions_token_hash"), table_name="sessions")
    op.drop_column("sessions", "expires_at")
    op.drop_column("sessions", "token_hash")

    op.drop_column("users", "password_hash")
