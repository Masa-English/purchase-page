// Scroll
$(function(){
  $('a[href^="#"]').click(function() {
    let speed = 400;
    let type = 'swing';
    let href= $(this).attr("href");
    let target = $(href == "#index" ? 'html' : href);
    let position = target.offset().top - 100;
    $('body,html').animate({scrollTop:position}, speed, type);
    return false;
  });
});

// Accordion
jQuery(function ($) {
  $(".ans").css("display", "none");
  $(".ans1").css("display", "none");
  $(".que").click(function () {
    $(".que").not(this).removeClass("open");
    $(".que").not(this).next().slideUp(300);
    $(this).toggleClass("open");
    $(this).next().slideToggle(300);
  });
});

// Hamburger
$(function () {
  $('.hamburger').click(function () {
    $(this).toggleClass('active');
    if ($(this).hasClass('active')) {
      $('.globalMenuSp').addClass('active');
    } else {
      $('.globalMenuSp').removeClass('active');
    }
  });
});
$('.globalMenuSp a[href^="#"]').on('click', function () {
  $('.hamburger').click();
  return false;
});

// Slick
$(function () {
  $('.slider').slick({
    autoplay: true,
    autoplaySpeed: 0, // ← 止まらない
    speed: 8000, // ← 流れる速さ（数値大きいほどゆっくり）
    cssEase: 'linear', // ← 等速
    slidesToShow: 4, // 表示枚数（お好みで）
    slidesToScroll: 1,
    infinite: true,
    arrows: false,
    dots: false,
    pauseOnHover: false,
    pauseOnFocus: false,
    swipe: false,
    touchMove: false
  });
});