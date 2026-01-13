/*global $, jQuery, alert*/
$(function () {
  $(".page__style").on("scroll", AOS.refreshHard);

  // 检测是否为移动设备
  var isMobile = $(window).width() < 768;

  //   TweenMax.to('.overlay h4', 2, {
  //     opacity: 0,
  //     y: -60,
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.to('.overlay p', 2, {
  //     delay: 0.3,
  //     opacity: 0,
  //     y: -60,
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.to('.overlay', 2, {
  //     delay: 2,
  //     top: '-100%',
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.from('.mylogo', 1, {
  //     delay: 5.5,
  //     opacity: 0,
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.from('.menu-burger', 1, {
  //     delay: 6.5,
  //     opacity: 0,
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.from('.privacy-policy-link', 1, {
  //     delay: 8.5,
  //     opacity: 0,
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.staggerFrom(
  //     '.menu-social-links-container ul li',
  //     1,
  //     {
  //       delay: 7.5,
  //       opacity: 0,
  //       x: -100,
  //       ease: Expo.easeInOut,
  //     },
  //     0.08
  //   );

  //   TweenMax.from('.slideshow__slide', 1, {
  //     delay: 9.5,
  //     opacity: 0,
  //     ease: Expo.easeInOut,
  //   });

  //   TweenMax.from('.c-header-home_footer', 1, {
  //     delay: 10.5,
  //     opacity: 0,
  //     ease: Expo.easeInOut,
  //   });

  // 覆盖层文字淡出动画
  TweenMax.to(".overlay h4", 2, {
    opacity: 0,
    y: -60,
    ease: Expo.easeInOut,
  });

  TweenMax.to(".overlay p", 2, {
    delay: 0.3,
    opacity: 0,
    y: -60,
    ease: Expo.easeInOut,
  });

  // 覆盖层移出动画
  TweenMax.to(".overlay", isMobile ? 1 : 2, {
    delay: isMobile ? 1 : 2,
    transform: "translateY(-100%)",
    ease: Expo.easeInOut,
    onComplete: function () {
      $(".overlay").css("display", "none");
    },
  });

  // 移动设备上简化动画
  if (isMobile) {
    // 同时显示logo和菜单
    TweenMax.from([".mylogo", ".menu-burger", ".privacy-policy-link"], 0.5, {
      delay: 2,
      opacity: 0,
      ease: Expo.easeInOut,
    });

    // 简化社交链接动画
    TweenMax.staggerFrom(
      ".menu-social-links-container ul li",
      0.3,
      {
        delay: 2.2,
        opacity: 0,
        x: -30,
        ease: Expo.easeInOut,
      },
      0.05
    );

    // 同时显示幻灯片和页脚
    TweenMax.from([".slideshow__slide", ".c-header-home_footer"], 0.5, {
      delay: 2.5,
      opacity: 0,
      ease: Expo.easeInOut,
    });
  } else {
    // 桌面设备上完整动画
    TweenMax.from(".mylogo", 1, {
      delay: 3,
      opacity: 0,
      ease: Expo.easeInOut,
    });

    TweenMax.from(".menu-burger", 1, {
      delay: 3.4,
      opacity: 0,
      ease: Expo.easeInOut,
    });

    TweenMax.from(".privacy-policy-link", 1, {
      delay: 3.8,
      opacity: 0,
      ease: Expo.easeInOut,
    });

    TweenMax.staggerFrom(
      ".menu-social-links-container ul li",
      1,
      {
        delay: 3.2,
        opacity: 0,
        x: -100,
        ease: Expo.easeInOut,
      },
      0.08
    );

    TweenMax.from(".slideshow__slide", 1, {
      delay: 5,
      opacity: 0,
      ease: Expo.easeInOut,
    });

    TweenMax.from(".c-header-home_footer", 1, {
      delay: 5.4,
      opacity: 0,
      ease: Expo.easeInOut,
    });
  }
});
