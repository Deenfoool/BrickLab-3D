import runpy
import unittest
from pathlib import Path

import fitz
import numpy as np


generator = runpy.run_path(Path(__file__).resolve().parents[1] / "scripts/build-instruction-part-maps.py")


class InstructionPdfTest(unittest.TestCase):
    def test_numbered_badges_keep_shape_and_ignore_unmarked_numbers(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=230, height=140)
            page.draw_rect(fitz.Rect(89, 24, 101, 36), color=None, fill=(0, 0, 0))
            page.draw_circle(fitz.Point(165, 30), 6, color=None, fill=(0, 0, 0))
            words = [(92, 25, 98, 35, "9"), (162, 25, 168, 35, "9"), (200, 25, 206, 35, "9")]
            parts = [(11, fitz.Rect(27, 25, 87, 49)), (22, fitz.Rect(106, 25, 157, 49))]
            badges = list(generator["numbered_badges"](words, page.get_drawings()))

            self.assertEqual(len(badges), 2)
            self.assertEqual(generator["artwork_badges"](parts, badges), {0: ("square", 9), 1: ("round", 9)})

    def test_badge_resolves_only_visually_close_candidates(self):
        shorter, longer, similar = ("short", "0"), ("long", "0"), ("similar", "0")
        matches = [(.015, shorter), (.024, longer), (.035, similar)]
        by_badge = generator["badge_match"]

        self.assertIsNone(generator["confident_match"](matches, .043, .028))
        self.assertEqual(by_badge(matches, {longer}, .043, .028), longer)
        self.assertIsNone(by_badge(matches, {longer, similar}, .043, .028))
        self.assertIsNone(by_badge([(.002, shorter), (.040, longer)], {longer}, .043, .028))
        self.assertIsNone(by_badge([(.025, shorter), (.046, longer)], {longer}, .043, .028))

    def test_caption_uses_art_inside_its_frame_once(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=230, height=180)
            page.draw_rect(fitz.Rect(20, 20, 90, 88), color=(0, 0, 0), fill=(1, 1, 1))
            captions = [(21, 66, 32, 76, "1x"), (21.1, 66, 32.1, 76, "1x")]
            images = [(11, (19.5, 28, 42, 66)), (22, (24, 32, 45, 65))]

            unframed = list(generator["artwork"](captions, images, 3, -2.5, 2))
            framed = list(generator["step_artwork"](page, captions, images))

            self.assertEqual(unframed[0][0], 11)
            self.assertEqual([part[0] for part in framed], [22])

    def test_neighbor_in_blank_corner_is_excluded_from_thumbnail(self):
        box = fitz.Rect(30, 23, 115, 80)
        neighbor = fitz.Rect(33, 25, 49, 37)
        with fitz.open() as pdf:
            for with_neighbor in (False, True):
                page = pdf.new_page(width=200, height=145)
                page.draw_rect(page.rect, color=None, fill=(.88, .88, .88))
                page.draw_line(fitz.Point(36, 72), fitz.Point(108, 31), color=(0, 0, 0), width=7)
                if with_neighbor:
                    page.draw_rect(fitz.Rect(35, 27, 46, 35), color=None, fill=(1, 0, 0))

            expected, aspect = generator["template"](pdf[0].get_displaylist(), box)
            raw, _ = generator["template"](pdf[1].get_displaylist(), box)
            cleaned, cleaned_aspect = generator["template"](pdf[1].get_displaylist(), box, (neighbor,))

            self.assertGreater(np.abs(raw - expected).mean(), .03)
            np.testing.assert_array_equal(cleaned, expected)
            self.assertEqual(cleaned_aspect, aspect)


if __name__ == "__main__":
    unittest.main()
