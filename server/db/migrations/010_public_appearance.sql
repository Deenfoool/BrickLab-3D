-- Explicitly published snapshots; existing cards stay without private media.
ALTER TABLE bricklab.public_profiles
 ADD COLUMN avatar_image bytea CHECK(octet_length(avatar_image) BETWEEN 1 AND 524288),
 ADD COLUMN cover_image bytea CHECK(octet_length(cover_image) BETWEEN 1 AND 524288),
 ADD COLUMN cover_theme text CHECK(cover_theme IN ('blueprint','graphite','amber')),
 ADD COLUMN background_theme text CHECK(background_theme IN ('default','first-build','carbon','neon'));
GRANT INSERT(avatar_image,cover_image,cover_theme,background_theme),
 UPDATE(avatar_image,cover_image,cover_theme,background_theme) ON bricklab.public_profiles TO bricklab_app;
